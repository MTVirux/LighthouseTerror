#!/usr/bin/env node
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { argv, env, stdout } from 'node:process';
import { REPO_JSON_URL } from '../config.js';
import { GithubClient } from './lib/github.mjs';
import { runSnapshot } from './lib/runner.mjs';

const args = new Set(argv.slice(2));
const dryRun = args.has('--dry-run');
const useFixtures = args.has('--fixtures');

async function realManifestFetcher(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'LighthouseTerror' } });
  if (!res.ok) throw new Error(`Manifest fetch ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fixtureManifestFetcher() {
  const text = await readFile(new URL('../tests/fixtures/repo.json', import.meta.url), 'utf8');
  return JSON.parse(text);
}

async function buildFixtureClient() {
  const text = await readFile(new URL('../tests/fixtures/github-responses.json', import.meta.url), 'utf8');
  const responses = JSON.parse(text);
  return {
    rateLimit: { remaining: 4999, limit: 5000, resetAt: new Date(Date.now() + 3600_000).toISOString() },
    async getRepo(owner, name) {
      const r = responses[`${owner}/${name}`];
      if (!r) { const e = new Error('no fixture'); e.name = 'GithubError'; e.status = 404; throw e; }
      if (r.error === 'rate_limited') { const e = new Error('rate'); e.name = 'RateLimitError'; e.resetAt = 'fixture'; throw e; }
      return r.repo;
    },
    async getReleases(owner, name) {
      const r = responses[`${owner}/${name}`];
      if (!r || r.error) { const e = new Error('no fixture'); e.name = 'GithubError'; e.status = 404; throw e; }
      return r.releases ?? [];
    },
    async getRuns(owner, name) {
      const r = responses[`${owner}/${name}`];
      if (!r || r.error) { const e = new Error('no fixture'); e.name = 'GithubError'; e.status = 404; throw e; }
      return r.runs ?? [];
    },
  };
}

function validateSchema(snap) {
  if (snap.schema !== 1) throw new Error(`unexpected schema ${snap.schema}`);
  if (typeof snap.snapshotAt !== 'string') throw new Error('snapshotAt must be string');
  if (!snap.source?.repoJsonUrl) throw new Error('source.repoJsonUrl required');
  if (!Array.isArray(snap.plugins)) throw new Error('plugins must be array');
  if (!Array.isArray(snap.errors)) throw new Error('errors must be array');
  if (!snap.rateLimit) throw new Error('rateLimit required');
}

async function main() {
  const manifestFetcher = useFixtures ? fixtureManifestFetcher : realManifestFetcher;
  const githubClient = useFixtures
    ? await buildFixtureClient()
    : new GithubClient({ token: env.GH_PAT ?? env.GITHUB_TOKEN ?? null });

  const snap = await runSnapshot({
    repoJsonUrl: REPO_JSON_URL,
    manifestFetcher,
    githubClient,
    now: new Date(),
  });

  validateSchema(snap);

  if (dryRun) {
    stdout.write(JSON.stringify(snap, null, 2));
    return;
  }

  const dayIso = snap.snapshotAt.slice(0, 10);
  const latestPath = 'data/latest.json';
  const dailyPath = `data/snapshots/${dayIso}.json`;
  await mkdir(dirname(dailyPath), { recursive: true });
  await writeFile(dailyPath, JSON.stringify(snap, null, 2) + '\n');
  await writeFile(latestPath, JSON.stringify(snap, null, 2) + '\n');
  console.log(`wrote ${latestPath} and ${dailyPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
