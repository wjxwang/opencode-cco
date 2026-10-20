import path from "path"

export namespace Identity {
  export const CHATCODE = "chatcode-cli"
  export const OPENCODE = "opencode"

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
    // An explicit identity wins over the launch name. Clients spawn their server through the
    // installed binary's real path (`opencode-cco`), so launch-name detection alone would flip
    // a default-mode server child into chatcode mode.
    if (env.OPENCODE_IDENTITY !== undefined) return env.OPENCODE_IDENTITY === CHATCODE
    // Windows installs the binary as `opencode-cco.exe`, so the launch name must match without the suffix.
    return [argv0, argv[0], argv[1]].some((entry) => path.basename(entry || "").replace(/\.exe$/i, "") === "opencode-cco")
  }

  export const chatcode = detect()
}
