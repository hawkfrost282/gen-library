import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { generateAutomationTypeDeclaration, AUTOMATION_API_VERSION, automationCommandRegistry } = await server.ssrLoadModule('/src/automation/command-registry.ts');
  const output = path.resolve('docs/manual/scripts/automation-api.d.ts');
  await mkdir(path.dirname(output), { recursive: true });
  const registryTypes = `export declare const AUTOMATION_API_VERSION: ${AUTOMATION_API_VERSION};\nexport type GenLibraryCommandId = ${automationCommandRegistry.map((entry) => `'${entry.commandId}'`).join(' | ')};\n\n`;
  await writeFile(output, registryTypes + generateAutomationTypeDeclaration());
} finally { await server.close(); }
