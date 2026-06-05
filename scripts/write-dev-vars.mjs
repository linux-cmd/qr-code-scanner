import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const envLocalPath = join(process.cwd(), '.env.local');
const devVarsPath = join(process.cwd(), '.dev.vars');

if (!existsSync(envLocalPath)) {
  process.exit(0);
}

const source = await readFile(envLocalPath, 'utf8');
const serverOnlyLines = source
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .filter((line) => !line.startsWith('VITE_'));

await writeFile(
  devVarsPath,
  [
    '# Generated from .env.local by scripts/write-dev-vars.mjs.',
    '# This file is ignored by git and is used by Wrangler Pages dev.',
    ...serverOnlyLines,
    ''
  ].join('\n')
);
