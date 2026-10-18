#!/usr/bin/env node

// The wrapper runs under Node, where process.title rewrites argv for ps aux; the spawned
// product inherits the identity through OPENCODE_IDENTITY instead of its own argv name.
process.title = "chatcode-cli"
process.env.OPENCODE_IDENTITY = "chatcode-cli"
require("./opencode.cjs")
