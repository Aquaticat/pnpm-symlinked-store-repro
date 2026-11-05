# pnpm shared-store links through a directory symlink

This repository reproduces a successful pnpm install whose transitive dependency cannot be imported.
It creates a synthetic ESM consumer,
a local `proper-lockfile` shim,
and a disposable store.
It needs no DSH installation,
registry packages,
credentials,
or existing pnpm store.

## Run

Node with native TypeScript support and `tar` are needed locally.
The provisioner downloads Node `26.13.0` and the selected pnpm release,
verifies their pinned SHA-256 hashes,
and keeps them inside `.tools/`.
CI uses the provisioned Node.

```sh
# Repository root, Linux x64
mise run toolchain:install
mise run prepare:control
mise run assert:control
mise run prepare:symlinked
mise run assert:symlinked
```

The last command asserts the expected successful import.
It exits nonzero when the bug reproduces,
with Node's `ERR_MODULE_NOT_FOUND` for `proper-lockfile`.
The real-directory control must pass first.

`PNPM_VERSION` selects a release listed in `tool-artifacts.json`.
Exact pins keep each result attributable;
the tested release list is not an upgrade recommendation.
`PNPM_BINARY` can select a source-built candidate for the same fixture.

The Actions workflow performs these steps without requiring Mise.
A red run is evidence only when the install and control steps passed
and the dependency assertion failed with the expected diagnostic.

## Workaround control

```sh
# Repository root, after preparing the symlinked case
mise run assert:workaround
```

This asks pnpm to reinstall using the physical store path.
It does not edit installed symlinks by hand.
The workaround requires callers to supply that path;
the source fix belongs in pnpm's handling of relative symlinks.

## Source prototype

The source patch and its verification evidence will be added after checking this exact standalone reproduction.
Published CI results will be linked here once their step conclusions and diagnostic logs have been inspected.
