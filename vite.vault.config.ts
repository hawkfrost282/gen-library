import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
export default defineConfig({ build: { lib: { entry: 'src/main/vault-supervisor-entry.ts', formats: ['cjs'], fileName: () => 'vault_supervisor.js' }, rollupOptions: { external: [...builtinModules, ...builtinModules.map((name) => `node:${name}`)] } } });
