#!/usr/bin/env node
/* share-brand.mjs: copy brands/<name>/ into the collateral builder, so posts and video cards share one brand.
     node scripts/share-brand.mjs <name>       (run npm run engines:fetch first) */
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name) { console.error('usage: node scripts/share-brand.mjs <brand name>'); process.exit(1); }
const from = join(ROOT, 'brands', name), to = join(ROOT, 'vendor', 'collateral-builder', 'brands', name);
if (!existsSync(from)) { console.error(`✗ no brands/${name}/`); process.exit(1); }
if (!existsSync(join(ROOT, 'vendor', 'collateral-builder'))) { console.error('✗ no vendor/collateral-builder/: run npm run engines:fetch'); process.exit(1); }
cpSync(from, to, { recursive: true });
console.log(`✓ brands/${name}/ → vendor/collateral-builder/brands/${name}/`);
