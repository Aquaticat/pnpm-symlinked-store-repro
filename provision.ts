// CI's preinstalled Node bootstraps the checksum-pinned runtime and package manager.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const artifacts = JSON.parse(readFileSync('tool-artifacts.json', 'utf8'));
const version = process.env.PNPM_VERSION ?? '12.16.1';
const platform = `${process.platform}-${process.arch}`;
const nodeArtifact = artifacts.node[platform];
const pnpmArtifact = artifacts.pnpm[version]?.[platform];
assert(nodeArtifact && pnpmArtifact, `No pinned artifacts for ${version} on ${platform}`);
const nodeRoot = resolve('.tools', 'node');
const pnpmRoot = resolve('.tools', `pnpm-${version}`);

/** Download and verify an artifact before extracting or executing any bytes. */
async function install({ baseUrl, artifact, destination, strip }: {
  baseUrl: string;
  artifact: { file: string; sha256: string };
  destination: string;
  strip: string[];
}) {
  mkdirSync(destination, { recursive: true });
  const response = await fetch(`${baseUrl}/${artifact.file}`);
  assert(response.ok, `Download failed: ${response.status} ${response.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  console.log(`SHA-256 verified: ${artifact.file} ${artifact.sha256}`);
  if (!artifact.file.endsWith('.gz') && !artifact.file.endsWith('.zip')) {
    const executable = join(destination, 'pnpm');
    writeFileSync(executable, bytes);
    chmodSync(executable, 0o755);
    return;
  }
  const archive = join(destination, artifact.file);
  writeFileSync(archive, bytes);
  execFileSync('tar', ['--extract', '--file', archive, '--directory', destination, ...strip], { stdio: 'inherit' });
}

await install({ baseUrl: `https://nodejs.org/dist/v${artifacts.nodeVersion}`, artifact: nodeArtifact, destination: nodeRoot, strip: ['--strip-components=1'] });
await install({ baseUrl: `https://github.com/pnpm/pnpm/releases/download/v${version}`, artifact: pnpmArtifact, destination: pnpmRoot, strip: [] });
const nodeBin = process.platform === 'win32' ? nodeRoot : join(nodeRoot, 'bin');
const executableSuffix = process.platform === 'win32' ? '.exe' : '';
assert.equal(execFileSync(join(nodeBin, `node${executableSuffix}`), ['--version'], { encoding: 'utf8' }).trim(), `v${artifacts.nodeVersion}`);
assert.equal(execFileSync(join(pnpmRoot, `pnpm${executableSuffix}`), ['--version'], { encoding: 'utf8' }).trim(), version);
if (process.env.GITHUB_PATH) appendFileSync(process.env.GITHUB_PATH, `${nodeBin}\n${pnpmRoot}\n`);
console.log(`Ready: Node ${artifacts.nodeVersion}, pnpm ${version}, ${platform}`);
