// node-gyp's Make generator leaves include paths and a dependency's shell action
// unquoted. Normalize only generated Makefiles, after configuration, before build.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
export async function rebuildNativeWithSpaces({ moduleRoot, headers, electronVersion }) {
  const previous = process.cwd();
  process.chdir(moduleRoot);
  try {
    const nodeGyp = require('@electron/node-gyp')();
    nodeGyp.parseArgv(['node', 'node-gyp', 'configure', `--target=${electronVersion}`, `--arch=${process.arch}`, '--dist-url=https://www.electronjs.org/headers', '--runtime=electron', '--silent']);
    nodeGyp.devDir = headers;
    await nodeGyp.commands.configure([]);
    const build = path.join(moduleRoot, 'build');
    const relativeHeaders = path.relative(build, headers).replaceAll(path.sep, '/');
    const walk = (folder) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name === 'Makefile' || entry.name.endsWith('.mk')) {
          let text = readFileSync(file, 'utf8');
          // Headers remain inside this project; relative compiler paths contain no spaces.
          text = text.replaceAll(`-I${headers}/`, `-I${relativeHeaders}/`)
            .replaceAll('LD_LIBRARY_PATH=$(builddir)/lib.host:$(builddir)/lib.target:$$LD_LIBRARY_PATH; export LD_LIBRARY_PATH;', '')
            .replaceAll('mkdir -p $(obj)/gen/sqlite3;', 'mkdir -p "$(obj)/gen/sqlite3";');
          writeFileSync(file, text);
        }
      }
    };
    walk(build);
    await nodeGyp.commands.build([]);
  } finally { process.chdir(previous); }
}
