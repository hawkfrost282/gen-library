import { createHash } from 'node:crypto';
import { constants, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export function vaultFileHash(file: string): string {
  if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw new Error('A vault transfer requires an ordinary file.');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW); const hash = createHash('sha256'); const buffer = Buffer.alloc(64 * 1024);
  try { for (;;) { const count = readSync(fd, buffer); if (!count) break; hash.update(buffer.subarray(0, count)); } } finally { closeSync(fd); }
  return hash.digest('hex');
}
export function syncVaultFile(file: string): void { const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }
export function vaultDirectory(root: string, ...parts: string[]): string {
  let current = root;
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || /[\\/\\\\]/u.test(part)) throw new Error('Invalid vault folder.');
    current = path.join(current, part);
    try { mkdirSync(current, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const info = lstatSync(current); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('A vault inbox cannot contain redirected folders.');
  }
  return current;
}
export function atomicVaultJson(file: string, value: unknown): void {
  const temp = `${file}.tmp`;
  const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, file); syncVaultFile(path.dirname(file));
}
