import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const upstream = resolve('upstream');
const patch = resolve('patches/pnpm-symlinked-store-path.patch');
const scratch = resolve('.work/prototype-tmp');
mkdirSync(scratch, { recursive: true });
const changedSources = ['pnpm/crates/fs/src/symlink_dir.rs', 'pnpm/crates/fs/src/symlink_dir/reuse.rs'];
const regression = 'unix_links_under_symlinked_parent_remain_resolvable';
const runner = 'pnpm/scripts/run-rust-tests.mjs';
const env = { ...process.env, TMPDIR: scratch };

// Only this disposable checkout is modified. Keep the new test while restoring production code for the red control.
execFileSync('git', ['apply', patch], { cwd: upstream, stdio: 'inherit' });
execFileSync('git', ['restore', '--source=HEAD', '--worktree', '--', ...changedSources], { cwd: upstream, stdio: 'inherit' });
const baseline = spawnSync(process.execPath, [runner, '--package', 'pnpm-fs', '--filter-expr', `test(${regression})`], { cwd: upstream, env, encoding: 'utf8' });
const output = `${baseline.stdout ?? ''}${baseline.stderr ?? ''}`;
process.stdout.write(output);
assert.notEqual(baseline.status, 0, 'The new regression must fail on unchanged source');
assert(output.includes(regression) && output.includes('resolve created link') && output.includes('NotFound'), 'The baseline must fail on the broken link, not during setup or compilation');
console.log('Verified red control: unchanged pnpm source creates an unresolvable link.');

execFileSync('git', ['apply', ...changedSources.map(path => `--include=${path}`), patch], { cwd: upstream, stdio: 'inherit' });
execFileSync(process.execPath, [runner, '--package', 'pnpm-fs', '--filter-expr', 'test(symlink_dir::)'], { cwd: upstream, env, stdio: 'inherit' });
console.log('Verified source repair: the symlink test group passes with the patch.');
