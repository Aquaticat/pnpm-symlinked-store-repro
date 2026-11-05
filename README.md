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

The [source patch](patches/pnpm-symlinked-store-path.patch) targets
pnpm commit `b4a2abfcb7cd17692ea90cea15ce7457fa7b4260`.
It uses the physical link parent for both link creation and the reuse check,
while preserving the target alias so subsequent retargeting remains visible.
The upstream code's [MIT license](patches/UPSTREAM-LICENSE) accompanies the patch.

The new regression failed on unchanged source with `NotFound`.
With the patch,
the Linux symlink test group passed all 19 tests,
including creation with missing parents,
target retargeting,
reuse,
and repair of an existing broken link.

```sh
# Disposable checkout of the upstream commit, after applying the patch
node pnpm/scripts/run-rust-tests.mjs --package pnpm-fs --filter-expr 'test(symlink_dir::)'
```

This is a source prototype,
not a replacement pnpm distribution.
The full CLI has not been rebuilt from it.

## Verification record

The exact standalone commands in this README were exercised on Linux with pnpm `12.16.1`
and Node `26.13.0`:
the real-directory control passed,
the symlinked import failed with `ERR_MODULE_NOT_FOUND`,
and the canonical-path workaround passed.

Verified CI evidence for commit `8c84d48f8c36ba3729a3e2f1fc982cf950f7e268`:

- [Reproduction run 42055610522](https://github.com/Aquaticat/pnpm-symlinked-store-repro/actions/runs/42055610522).
- [Repeat run 42056201476](https://github.com/Aquaticat/pnpm-symlinked-store-repro/actions/runs/42056201476).
- [Source-patch verification](https://github.com/Aquaticat/pnpm-symlinked-store-repro/actions/runs/42055609601).

The reproduction runs fail specifically at `Assert the symlinked store resolves its dependency`:

- Linux:
  pnpm `12.16.1`,
  `12.18.0`,
  and `11.28.11` produce `ERR_MODULE_NOT_FOUND` for `proper-lockfile`.
- macOS and Windows:
  pnpm `12.18.0` produces the same diagnostic.
- Every affected job passes provisioning,
  the real-directory import,
  the symlinked-directory install,
  and the canonical-path workaround.
- The `10.34.9` job passes,
  but its consumer stays under the project's `node_modules/.pnpm`.
  This fixture does not exercise a global virtual store on that release,
  so this is not evidence that its global-store behavior is fixed.

The source-patch workflow is green.
Its logs show the new regression failing with `NotFound` on unchanged source,
followed by 19 passing symlink tests with the patch.
Both reproduction runs' step conclusions and missing-package diagnostics were inspected;
the patch run's failing control and passing test summary were inspected too.

An initial Windows harness run failed during extraction because Git Bash's GNU tar
treated a drive letter as a remote host.
The corrected harness selects Windows' native `System32/tar.exe`.
The evidence runs linked here pass that setup step and reach the import assertion.

Written by an agent (Codex, GPT-6).
