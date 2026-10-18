#!/usr/bin/env bun

import { $ } from "bun"
import { parseArgs } from "util"
import path from "path"
import { fileURLToPath } from "url"

const REPO = "wjxwang/opencode-cco"
const CHANNEL = "local"

// Must match `allTargets` in packages/cli/script/build.ts (`opencode-<os>-<arch>[-baseline][-musl]`).
const targets = [
  "linux-arm64",
  "linux-x64",
  "linux-x64-baseline",
  "linux-arm64-musl",
  "linux-x64-musl",
  "linux-x64-baseline-musl",
  "darwin-arm64",
  "darwin-x64",
  "darwin-x64-baseline",
  "windows-arm64",
  "windows-x64",
  "windows-x64-baseline",
]

const usage = `Usage: bun script/release-cco.ts <version> [options]

Builds all CLI targets, packs opencode-cco-<target>.tgz assets, tags the release,
creates the GitHub Release, and uploads assets.

Options:
  --skip-build   Reuse existing packages/cli/dist output instead of building
  --dry-run      Pack and print planned actions; no git or GitHub API calls
  -h, --help     Show this help

The GitHub token is read from GITHUB_TOKEN or GH_TOKEN (required unless --dry-run).
`

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "skip-build": { type: "boolean" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log(usage)
  process.exit(0)
}

const rawVersion = positionals[0]
if (!rawVersion) {
  console.error(usage)
  process.exit(1)
}
const version = rawVersion.replace(/^v/, "")
if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${rawVersion} (expected semver such as 2.0.28-cco.1)`)
  process.exit(1)
}
const tag = `v${version}`
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
if (!token && !values["dry-run"]) {
  console.error("GITHUB_TOKEN (or GH_TOKEN) is required unless --dry-run")
  process.exit(1)
}

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
process.chdir(root)
const dist = path.join(root, "packages", "cli", "dist")
const releaseDir = path.join(dist, "release")

if (!values["skip-build"]) {
  console.log(`=== building ${targets.length} targets (channel=${CHANNEL}, version=${version}) ===\n`)
  await $`bun run --cwd packages/cli build --skip-web-ui`.env({
    OPENCODE_CHANNEL: CHANNEL,
    OPENCODE_VERSION: version,
  })
} else {
  console.log("=== skipping build, reusing packages/cli/dist ===\n")
}

const missing: string[] = []
for (const target of targets) if (!(await Bun.file(binaryPath(target)).exists())) missing.push(target)
if (missing.length) {
  console.error(`Missing build output for: ${missing.join(", ")}`)
  console.error("Run without --skip-build, or check the build logs.")
  process.exit(1)
}

console.log("=== packing assets ===\n")
await $`rm -rf ${releaseDir}`
await $`mkdir -p ${releaseDir}`
for (const target of targets) {
  const name = assetName(target)
  const stage = path.join(releaseDir, ".stage")
  await $`mkdir -p ${stage}`
  const member = target.startsWith("windows") ? "opencode-cco.exe" : "opencode-cco"
  await $`cp ${binaryPath(target)} ${path.join(stage, member)}`
  await $`tar -czf ${path.join(releaseDir, name)} -C ${stage} ${member}`
  await $`rm -rf ${stage}`
  const size = Bun.file(path.join(releaseDir, name)).size
  console.log(`${name}  ${(size / 1024 / 1024).toFixed(1)} MB`)
}

if (values["dry-run"]) {
  console.log(`\n[dry-run] would push tag ${tag} and create release ${tag} with ${targets.length} assets`)
  process.exit(0)
}

console.log(`\n=== tagging ${tag} ===\n`)
const tagged = (await $`git rev-parse -q --verify refs/tags/${tag}`.quiet().nothrow()).exitCode
if (tagged !== 0) {
  await $`git tag ${tag}`
}
// GitHub's git endpoints reject Bearer PATs (401); only Basic works there.
const pushAuth = `http.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`
for (let attempt = 1; attempt <= 15; attempt++) {
  const pushed = (await $`git -c ${pushAuth} push origin ${tag}`.nothrow()).exitCode
  if (pushed === 0) break
  if (attempt === 15) throw new Error(`Push tag ${tag} failed`)
  console.error(`tag push attempt ${attempt} failed, retrying`)
  await Bun.sleep(attempt * 4000)
}

console.log(`\n=== release ${tag} ===\n`)
const api = `https://api.github.com/repos/${REPO}`
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
}

type Release = { id: number; assets: { id: number; name: string; size: number }[]; html_url: string; upload_url: string }

const release = await ensureRelease()

const existing = new Map<string, number>()
for (const asset of release.assets) existing.set(asset.name, asset.size)

console.log("=== uploading assets ===\n")
let uploaded = 0
let skipped = 0
for (const target of targets) {
  const name = assetName(target)
  if (existing.get(name) === Bun.file(path.join(releaseDir, name)).size) {
    skipped++
    console.log(`${name}  already uploaded, skipping`)
    continue
  }
  await upload(name)
  uploaded++
}
console.log(`\ndone: ${uploaded} uploaded, ${skipped} skipped, release ${release.html_url}`)

function assetName(target: string) {
  return `opencode-cco-${target}.tgz`
}

function binaryPath(target: string) {
  const name = `cli-${target}`
  return path.join(dist, name, "bin", target.startsWith("windows") ? "opencode.exe" : "opencode")
}

async function ensureRelease() {
  return retry(`release ${tag}`, async () => {
    const existing = await getRelease()
    if (existing) return existing
    const created = await fetch(`${api}/releases`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        draft: false,
        prerelease: false,
        body: `opencode-cco ${version}\n\nInstall:\ncurl -fsSL https://github.com/${REPO}/raw/dev/install-cco | bash`,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!created.ok) throw new Error(`Create release failed: ${created.status} ${await created.text()}`)
    return (await created.json()) as Release
  })
}

async function getRelease() {
  const response = await fetch(`${api}/releases/tags/${tag}`, { headers, signal: AbortSignal.timeout(60_000) })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`Fetch release failed: ${response.status} ${await response.text()}`)
  return (await response.json()) as Release
}

async function deleteAsset(name: string) {
  const current = await retry(`locate asset ${name}`, getRelease)
  if (!current) return
  for (const asset of current.assets) {
    if (asset.name !== name) continue
    await retry(`delete asset ${name}`, async () => {
      const response = await fetch(`${api}/releases/assets/${asset.id}`, {
        method: "DELETE",
        headers,
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok && response.status !== 404)
        throw new Error(`Delete asset failed: ${response.status} ${await response.text()}`)
    })
    console.log(`${name}  removed partial asset`)
  }
}

async function upload(name: string) {
  const url = release.upload_url.replace(/\{.*\}$/, "") + `?name=${encodeURIComponent(name)}`
  const file = Bun.file(path.join(releaseDir, name))
  let lastError = ""
  for (let attempt = 1; attempt <= 6; attempt++) {
    // A previous interrupted attempt can leave a partial asset that blocks re-upload with 422.
    await deleteAsset(name)
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/gzip" },
        body: file,
        signal: AbortSignal.timeout(900_000),
      })
      if (response.ok) {
        console.log(`${name}  uploaded`)
        return
      }
      lastError = `${response.status} ${await response.text()}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    console.error(`${name}  attempt ${attempt} failed: ${lastError}`)
    if (attempt < 6) await Bun.sleep(attempt * 5000)
  }
  throw new Error(`Upload failed for ${name}: ${lastError}`)
}

async function retry<T>(label: string, run: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= attempts) throw error
      console.error(`${label} attempt ${attempt} failed: ${error instanceof Error ? error.message : error}`)
      await Bun.sleep(attempt * 5000)
    }
  }
}
