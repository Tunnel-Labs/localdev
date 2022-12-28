# localdev

An interactive TUI for local development.

[A video of using localdev](https://github.com/leondreamed/localdev/blob/main/assets/localdev.gif?raw=true)

## Usage

Install the `localdev-tui` from npm using your favorite package manager:

```sh
npm install --save-dev localdev-tui
```

Then, create a `localdev.config.mjs` file in the root of your project:

```typescript
// @ts-check

/** @type {import('localdev-tui').LocaldevConfig} */
export default {
  servicesToLog: {
    'my-website': true
  },
  services: {
    'my-website': {
      healthCheck: {
        port: 3001
      },
      command: "npm run start"
    },
  },
  localDomains: ['my-website.test'],
  proxyRouter(req) {
    const hostname = req.hostname

    if (hostname === 'my-website.test') {
      return 'http://127.0.0.1:3001'
    }
  }
}
```

Then, add a `dev` script in your project's `package.json` file:

```jsonc
{
  "scripts": {
    "dev": "localdev",
    // ...
  }
}
```

Now, you can run `npm run dev` (or the equivalent for your package manager) to start localdev!

## Motivation

Often times, developing a complex application involves running many separate services that interact with each other. During development, it's tedious to manually run every service in separate terminals every time. Instead, it's a lot easier to have one dev server that automatically manages multiple development processes.

However, building a dev server isn't as easy as simply running all programs concurrently and outputting all their logs. Many services output a significant amount of logging output (especially during debugging) that can quickly clutter a single terminal window.

Thus, an interactive solution is needed, and that's where building a TUI for local development comes into play.

### Why not Kubernetes?

You might recognize that managing multiple services sounds similar to Kubernetes, and you wouldn't be mistaken. Kubernetes does solve a similar use case, which we heavily rely on for deployment.

However, during development, Kubernetes incurs significant performance and DX (developer experience) tradeoffs. Running development processes in a VM or Docker can be 10x slower than running the process on the host machine, not to mention the extra amount of disk space, CPU and memory a local Kubernetes cluster running minikube would take up.

Thus, we decided that we will instead focus on building a great developer experience by running development processes on the host machine.
