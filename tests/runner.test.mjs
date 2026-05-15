import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSnapshot } from '../scripts/lib/runner.mjs';
import { RateLimitError, GithubError } from '../scripts/lib/github.mjs';

const REPO_URL = 'https://raw.githubusercontent.com/MTVirux/SeaOfTerror/main/repo.json';
const NOW = new Date('2026-05-15T12:00:00Z');

const SAMPLE = [
  { Author: 'MTVirux', Name: 'A', InternalName: 'A',
    AssemblyVersion: '1.0.0', TestingAssemblyVersion: '1.0.0',
    DalamudApiLevel: 15, TestingDalamudApiLevel: 15,
    DownloadCount: 100, LastUpdate: 1700000000,
    RepoUrl: 'https://github.com/MTVirux/A',
    IconUrl: '', IsHide: 'False', IsTestingExclusive: 'False' },
  { Author: 'MTVirux', Name: 'B', InternalName: 'B',
    AssemblyVersion: '1.0.0', TestingAssemblyVersion: '1.0.0',
    DalamudApiLevel: 15, TestingDalamudApiLevel: 15,
    DownloadCount: 200, LastUpdate: 1700000000,
    RepoUrl: 'https://github.com/MTVirux/B',
    IconUrl: '', IsHide: 'False', IsTestingExclusive: 'False' },
];

function makeClient(responses) {
  return {
    rateLimit: { remaining: 4999, limit: 5000, resetAt: '2026-05-15T13:00:00Z' },
    async getRepo(o, n) {
      const r = responses[`${o}/${n}`];
      if (r?.throw) throw r.throw;
      return r?.repo ?? { default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-10T00:00:00Z' };
    },
    async getReleases(o, n) {
      const r = responses[`${o}/${n}`];
      if (r?.throw) throw r.throw;
      return r?.releases ?? [];
    },
    async getRuns(o, n) {
      const r = responses[`${o}/${n}`];
      if (r?.throw) throw r.throw;
      return r?.runs ?? [];
    },
  };
}

test('happy path: both plugins get github data', async () => {
  const manifestFetcher = async () => SAMPLE;
  const githubClient = makeClient({
    'MTVirux/A': { repo: { default_branch: 'main', open_issues_count: 1, pushed_at: '2026-05-10T00:00:00Z' }, releases: [], runs: [] },
    'MTVirux/B': { repo: { default_branch: 'main', open_issues_count: 2, pushed_at: '2026-05-09T00:00:00Z' }, releases: [], runs: [] },
  });
  const snap = await runSnapshot({ repoJsonUrl: REPO_URL, manifestFetcher, githubClient, now: NOW });
  assert.equal(snap.plugins.length, 2);
  assert.equal(snap.plugins[0].github.ok, true);
  assert.equal(snap.plugins[1].github.ok, true);
});

test('manifest fetch failure: plugins:[] + errors entry', async () => {
  const manifestFetcher = async () => { throw new Error('boom'); };
  const snap = await runSnapshot({ repoJsonUrl: REPO_URL, manifestFetcher, githubClient: makeClient({}), now: NOW });
  assert.deepEqual(snap.plugins, []);
  assert.equal(snap.errors[0].stage, 'fetch-manifest');
});

test('one plugin GH failure: that plugin gets ok:false', async () => {
  const manifestFetcher = async () => SAMPLE;
  const githubClient = makeClient({
    'MTVirux/A': { throw: new GithubError('not found', { status: 404 }) },
    'MTVirux/B': { repo: { default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-09T00:00:00Z' }, releases: [], runs: [] },
  });
  const snap = await runSnapshot({ repoJsonUrl: REPO_URL, manifestFetcher, githubClient, now: NOW });
  const a = snap.plugins.find((p) => p.internalName === 'A');
  const b = snap.plugins.find((p) => p.internalName === 'B');
  assert.equal(a.github.ok, false);
  assert.equal(a.github.reason, 'http_404');
  assert.equal(b.github.ok, true);
});

test('rate limit mid-run marks remaining plugins rate_limited', async () => {
  const manifestFetcher = async () => SAMPLE;
  const githubClient = makeClient({
    'MTVirux/A': { throw: new RateLimitError('2026-05-15T13:00:00Z') },
  });
  const snap = await runSnapshot({ repoJsonUrl: REPO_URL, manifestFetcher, githubClient, now: NOW });
  const a = snap.plugins.find((p) => p.internalName === 'A');
  const b = snap.plugins.find((p) => p.internalName === 'B');
  assert.equal(a.github.ok, false);
  assert.equal(b.github.ok, false);
  assert.equal(b.github.reason, 'rate_limited');
  assert.equal(snap.errors.some((e) => e.stage === 'rate-limited'), true);
});

test('rateLimit block reflects the client after the run', async () => {
  const manifestFetcher = async () => SAMPLE;
  const githubClient = makeClient({
    'MTVirux/A': { repo: { default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-10T00:00:00Z' }, releases: [], runs: [] },
    'MTVirux/B': { repo: { default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-10T00:00:00Z' }, releases: [], runs: [] },
  });
  githubClient.rateLimit = { remaining: 4823, limit: 5000, resetAt: '2026-05-15T13:00:00Z' };
  const snap = await runSnapshot({ repoJsonUrl: REPO_URL, manifestFetcher, githubClient, now: NOW });
  assert.deepEqual(snap.rateLimit, { remaining: 4823, limit: 5000, resetAt: '2026-05-15T13:00:00Z' });
});
