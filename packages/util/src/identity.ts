import path from "path"

export namespace Identity {
  export const CHATCODE = "chatcode-cli"

  // Pure predicate so both trigger paths stay testable while production callers use the
  // cached `chatcode` evaluated once at module load. argv[1] is the entry file when a runtime
  // executes source. In Bun compiled binaries `process.argv` is the virtual-fs path
  // (`/$bunfs/root/opencode`), so the invoked launch name (e.g. an `opencode-cco` symlink) is
  // only visible through `process.argv0`.
  export function detect(
    env: Record<string, string | undefined> = process.env,
    argv: readonly string[] = process.argv,
    argv0: string = process.argv0,
  ) {
    if (env.OPENCODE_IDENTITY === CHATCODE) return true
    return [argv0, argv[0], argv[1]].some((entry) => path.basename(entry || "") === "opencode-cco")
  }

  export const chatcode = detect()
}
