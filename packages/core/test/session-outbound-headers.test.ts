import { expect, test } from "bun:test"
import { App } from "@opencode/core/app"
import { Project } from "@opencode/core/project"
import { SessionSchema } from "@opencode/core/session/schema"
import { SessionModelRequest } from "@opencode/core/session/model-request"

const app = App.make({ name: "opencode", version: "1.0.0", channel: "latest" })
const session = {
  id: SessionSchema.ID.make("ses_1"),
  parentID: SessionSchema.ID.make("ses_parent"),
  projectID: Project.ID.make("proj_1"),
}

test("default mode keeps the upstream outbound header set", () => {
  expect(SessionModelRequest.outboundHeaders(session, "affinity", app, false)).toEqual({
    "x-session-affinity": "affinity",
    "X-Session-Id": "affinity",
    "User-Agent": "opencode/latest/1.0.0/opencode",
    "x-parent-session-id": "ses_parent",
    "x-opencode-session-id": "ses_1",
    "x-opencode-parent-session-id": "ses_parent",
    "x-opencode-project": "proj_1",
    "x-opencode-session": "affinity",
    "x-opencode-client": "opencode",
  })
})

test("chatcode mode sends only neutral attribution headers", () => {
  expect(SessionModelRequest.outboundHeaders(session, "affinity", app, true)).toEqual({
    "x-session-affinity": "affinity",
    "X-Session-Id": "affinity",
    "User-Agent": "chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)",
    "x-parent-session-id": "ses_parent",
  })
})

test("chatcode mode with a client-configured app name still omits client headers", () => {
  const custom = App.make({ name: "custom-client" })
  const headers = SessionModelRequest.outboundHeaders(session, "affinity", custom, true)
  expect(Object.keys(headers).filter((key) => key.startsWith("x-opencode-"))).toEqual([])
  expect(Object.keys(headers).filter((key) => key.toLowerCase().includes("client"))).toEqual([])
  expect(headers["User-Agent"]).toBe("chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)")
})

test("parent headers follow the parent session in both modes", () => {
  const root = { id: SessionSchema.ID.make("ses_1"), projectID: Project.ID.make("proj_1") }
  const defaultHeaders = SessionModelRequest.outboundHeaders(root, "affinity", app, false)
  expect(defaultHeaders["x-opencode-parent-session-id"]).toBeUndefined()
  expect(defaultHeaders["x-parent-session-id"]).toBeUndefined()
  const chatcodeHeaders = SessionModelRequest.outboundHeaders(root, "affinity", app, true)
  expect(chatcodeHeaders["x-parent-session-id"]).toBeUndefined()
  expect(chatcodeHeaders["x-session-affinity"]).toBe("affinity")
})
