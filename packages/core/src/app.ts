export * as App from "./app.js"

import { Context, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Identity } from "@opencode/util/identity"

export interface Info {
  readonly name: string
  readonly version: string
  readonly channel: string
}

export const Metadata = Context.Reference<Info>("@opencode/App", {
  defaultValue: () => make(),
})

export function make(input: Partial<Info> = {}): Info {
  return {
    name: input.name ?? "opencode",
    version: input.version ?? "unknown",
    channel: input.channel ?? "unknown",
  }
}

export function useragent(app: Info, chatcode = Identity.chatcode) {
  // Literally the installed chatcode-cli identity: never derived from this repository's version.
  if (chatcode) return "chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)"
  return `opencode/${app.channel}/${app.version}/${app.name}`
}

export const layer = (input?: Partial<Info>) => Layer.succeed(Metadata, make(input))

export const configured = (input?: Partial<Info>) =>
  makeGlobalNode({ service: Metadata, layer: layer(input), deps: [] })

export const node = configured()
