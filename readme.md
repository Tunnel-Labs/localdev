# localdev

A TUI for local development.

**Note:** This package does not currently work as-is; work still needs to be done to make it application-agnostic (right now this repository only contains a stale copy of the `localdev` package in the [Dialect](https://github.com/Dialect-Inc) monorepo for internal use within Dialect).

## Motivation

Often times, developing a complex application involves running many separate services that interact with each other. During development, it's tedious to manually run every service in separate terminals every time. Instead, it's a lot easier to have one dev server that automatically manages multiple development processes.

However, building a dev server isn't as easy as simply running all programs concurrently and outputting all their logs. Many services output a significant amount of logging output (especially during debugging) that can quickly clutter a single terminal window.

Thus, an interactive solution is needed, and that's where building a TUI for local development comes into play.

### Why not Kubernetes?

You might recognize that managing multiple services sounds similar to Kubernetes, and you wouldn't be mistaken. Kubernetes does solve a similar use case, which we heavily rely on for deployment.

However, during development, Kubernetes incurs significant performance and DX (developer experience) tradeoffs. Running development processes in a VM or Docker can be 10x slower than running the process on the host machine, not to mention the extra amount of disk space, CPU and memory a local Kubernetes cluster running minikube would take up.

Thus, we decided that we will instead focus on building a great developer experience by running development processes on the host machine.
