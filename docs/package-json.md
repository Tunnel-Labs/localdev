---
aside: false
---

# package.json

<script setup>
const packageJsonComments = {
  scripts: {
    dev: outdent`
      The entrypoint for all \`dev\` operations.
    `
  },
  dependencies: {
    'node-pty': outdent`
      Used to emulate a terminal so that the output from processes will match exactly with the output they'd produce when running from a terminal window (which is desired since we access their logs through a terminal window).
    `,
    'http-proxy': outdent`
      Used to forward an HTTP request (and return the corresponding HTTP response) to other local HTTP servers.
    `,
    react: outdent`
      React is used for Ink, but we need to stay on React 17 because Ink does not support React 18 yet (see https://github.com/vadimdemedes/ink/issues/526).
    `,
    'socket.io': outdent`
      Socket.IO is used for communication between the \`dev\` server and \`dev\` operations.
    `,
    'socket.io-client': outdent`
      Used by \`dev\` operations to communicate with the \`dev\` server.
    `
  }
}
</script>

<PackageJson
  :json-string='packageJsonString'
  :comments='packageJsonComments'
/>
