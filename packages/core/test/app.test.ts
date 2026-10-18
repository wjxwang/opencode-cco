import { expect, test } from "bun:test"
import { App } from "@opencode/core/app"

test("formats app metadata as a user agent", () => {
  expect(App.useragent(App.make({ name: "sdk", version: "1.2.3", channel: "beta" }))).toBe("opencode/beta/1.2.3/sdk")
  expect(App.useragent(App.make({ name: "sdk", version: "1.2.3", channel: "beta" }), false)).toBe(
    "opencode/beta/1.2.3/sdk",
  )
})

test("chatcode identity uses the literal chatcode-cli user agent", () => {
  expect(App.useragent(App.make(), true)).toBe(
    "chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)",
  )
})
