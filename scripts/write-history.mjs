#!/usr/bin/env node
import { readdir, writeFile } from 'node:fs/promises';

const SNAP_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

async function main() {
  let entries = [];
  try {
    entries = await readdir('data/snapshots');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const snapshots = entries.filter((n) => SNAP_RE.test(n)).sort();
  const out = { generatedAt: new Date().toISOString(), snapshots };
  await writeFile('data/history.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote data/history.json with ${snapshots.length} snapshots`);
}

main().catch((err) => { console.error(err); process.exit(1); });
