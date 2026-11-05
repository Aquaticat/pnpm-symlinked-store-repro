// No registry package, DSH installation, credentials, or existing pnpm store is needed.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const [action, mode] = process.argv.slice(2);
assert(['prepare', 'assert', 'workaround'].includes(action), 'Use: reproduce.ts prepare|assert|workaround control|symlinked');
assert(['control', 'symlinked'].includes(mode), 'Mode must be control or symlinked');
const version = process.env.PNPM_VERSION ?? '12.16.1';
assert(/^\d+\.\d+\.\d+$/.test(version), 'PNPM_VERSION must identify a pinned release');
const pnpm = process.env.PNPM_BINARY ?? resolve('.tools', `pnpm-${version}`, process.platform === 'win32' ? 'pnpm.exe' : 'pnpm');
const work = resolve('.work');
mkdirSync(work, { recursive: true });
const statePath = join(work, `${version}-${mode}.json`);
const expected = 'proper-lockfile shim imported';

/** Isolate package-manager configuration without changing the real home or store. */
function fixtureEnvironment(root: string) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(npm|pnpm)_config_/i.test(key)));
  const config = join(root, 'config');
  mkdirSync(config, { recursive: true });
  const npmrc = join(config, 'npmrc');
  writeFileSync(npmrc, '');
  return { ...inherited, CI: 'true', XDG_CONFIG_HOME: config, NPM_CONFIG_USERCONFIG: npmrc, PNPM_CONFIG_NPMRC_AUTH_FILE: npmrc };
}

/** Install the same synthetic consumer with the chosen spelling of its store path. */
function install({ root, project, store }: { root: string; project: string; store: string }) {
  writeFileSync(join(project, 'pnpm-workspace.yaml'), `packages: []\nstoreDir: ${JSON.stringify(store)}\nenableGlobalVirtualStore: true\noverrides:\n  proper-lockfile: link:shim\n`);
  execFileSync(pnpm, ['install', '--offline', '--ignore-scripts', '--no-frozen-lockfile', '--force'], { cwd: project, env: fixtureEnvironment(root), stdio: 'inherit' });
}

/** Check the actual Node import, and print the installed link for diagnosis. */
function assertImport(state: { root: string; project: string }) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', 'console.log((await import("fixture-consumer")).default)'], { cwd: state.project, encoding: 'utf8', env: fixtureEnvironment(state.root) });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  const consumer = realpathSync(join(state.project, 'node_modules/fixture-consumer'));
  const link = join(dirname(consumer), 'proper-lockfile');
  console.log(JSON.stringify({ node: process.version, pnpm: version, mode, consumer, link: readlinkSync(link), targetExists: existsSync(link), importExit: result.status }));
  assert.equal(result.status, 0, 'Expected the installed consumer to import its declared proper-lockfile dependency');
  assert.equal(result.stdout.trim(), expected);
}

if (action === 'prepare') {
  const root = realpathSync(mkdtempSync(join(work, `${version}-${mode}-`)));
  const physical = join(root, 'physical/deeper/store');
  const alias = join(root, 'store-alias');
  const project = join(root, 'project');
  const consumer = join(root, 'consumer/package');
  mkdirSync(physical, { recursive: true });
  mkdirSync(consumer, { recursive: true });
  mkdirSync(join(project, 'shim'), { recursive: true });
  symlinkSync(physical, alias, process.platform === 'win32' ? 'junction' : 'dir');
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'fixture-consumer', version: '1.0.0', type: 'module', main: 'index.js', dependencies: { 'proper-lockfile': '1.0.0' } }));
  writeFileSync(join(consumer, 'index.js'), 'export { default } from "proper-lockfile";\n');
  writeFileSync(join(project, 'shim/package.json'), JSON.stringify({ name: 'proper-lockfile', version: '1.0.0', type: 'module', main: 'index.js' }));
  writeFileSync(join(project, 'shim/index.js'), `export default ${JSON.stringify(expected)};\n`);
  execFileSync('tar', ['--create', '--gzip', '--file', join(root, 'consumer.tgz'), '--directory', dirname(consumer), 'package']);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ private: true, dependencies: { 'fixture-consumer': 'file:../consumer.tgz' } }));
  const state = { root, project, physical, alias };
  install({ root, project, store: mode === 'control' ? physical : alias });
  writeFileSync(statePath, JSON.stringify(state));
  console.log(`Install completed: ${mode}`);
} else {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (action === 'workaround') install({ root: state.root, project: state.project, store: state.physical });
  assertImport(state);
}
