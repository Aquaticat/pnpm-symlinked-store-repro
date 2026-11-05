import assert from 'node:assert/strict';
import { join } from 'node:path';

/** Locate Windows' native archive reader; Git Bash's tar interprets drive letters as remote hosts. */
function windowsTar(): string {
  const root = process.env.SystemRoot;
  assert(root, 'SystemRoot is required to locate the Windows tar executable');
  return join(root, 'System32', 'tar.exe');
}

export const tarCommand = process.platform === 'win32' ? windowsTar() : 'tar';
