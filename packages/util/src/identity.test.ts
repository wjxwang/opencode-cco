import { describe, expect, test } from "bun:test"
import { Identity } from "./identity.js"

describe("Identity.detect", () => {
  test("env identity", () => {
    expect(Identity.detect({ OPENCODE_IDENTITY: "chatcode-cli" }, ["node", "/repo/index.ts"])).toBe(true)
  })

  test("other env value is default identity", () => {
    expect(Identity.detect({ OPENCODE_IDENTITY: "opencode" }, ["node", "/repo/index.ts"])).toBe(false)
  })

  test("compiled binary launch name from argv[0]", () => {
    expect(Identity.detect({}, ["/usr/local/bin/opencode-cco", "serve"])).toBe(true)
  })

  test("compiled binary invoked via symlink keeps the launch name in argv0", () => {
    // Bun compiled binaries report argv as virtual-fs paths (`/$bunfs/root/opencode`);
    // the invoked symlink path is only visible through process.argv0.
    expect(Identity.detect({}, ["bun", "/$bunfs/root/opencode", "serve"], "/usr/local/bin/opencode-cco")).toBe(
      true,
    )
  })

  test("source entry name from argv[1]", () => {
    expect(Identity.detect({}, ["bun", "/usr/local/bin/opencode-cco"])).toBe(true)
  })

  test("default launch names", () => {
    expect(Identity.detect({}, ["/usr/local/bin/opencode", "serve"])).toBe(false)
    expect(Identity.detect({}, ["bun", "/repo/packages/cli/src/index.ts"])).toBe(false)
    expect(Identity.detect({}, ["node", "/repo/packages/cli/bin/opencode.cjs"])).toBe(false)
    expect(Identity.detect({}, ["bun", "/$bunfs/root/opencode", "serve"], "/usr/local/bin/opencode")).toBe(false)
  })

  test("chatcode matches the process predicate", () => {
    expect(Identity.chatcode).toBe(Identity.detect())
  })
})
