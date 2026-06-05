import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const publicDir = join(process.cwd(), 'public');
const adsPath = join(publicDir, 'ads.txt');
const publisherId = process.env.ADSENSE_PUBLISHER_ID?.trim();

await mkdir(publicDir, { recursive: true });

if (!publisherId) {
  await rm(adsPath, { force: true });
  process.exit(0);
}

const normalizedId = publisherId.startsWith('pub-') ? publisherId : `pub-${publisherId}`;
await writeFile(adsPath, `google.com, ${normalizedId}, DIRECT, f08c47fec0942fa0\n`);
