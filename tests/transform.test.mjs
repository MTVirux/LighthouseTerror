import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSnapshot } from '../scripts/lib/transform.mjs';

const repoJson = JSON.parse(await readFile(new URL('./fixtures/repo.json', import.meta.url), 'utf8'));
const REPO_URL = 'https://raw.githubusercontent.com/MTVirux/SeaOfTerror/main/repo.json';
const NOW = new Date('2026-05-15T12:00:00Z');

function baseArgs(overrides = {}) {
  return {
    repoJson,
    ghByPlugin: {},
    repoJsonUrl: REPO_URL,
    groupRepoMeta: { lastCommitAt: null, openIssues: 0, manifestLastModifiedAt: null },
    now: NOW,
    rateLimit: { remaining: 5000, limit: 5000, resetAt: new Date('2026-05-15T13:00:00Z').toISOString() },
    ...overrides,
  };
}

test('snapshot has schema 1 and ISO snapshotAt', () => {
  const snap = buildSnapshot(baseArgs());
  assert.equal(snap.schema, 1);
  assert.equal(snap.snapshotAt, '2026-05-15T12:00:00.000Z');
});

test('source block contains the URL and the derived slug', () => {
  const snap = buildSnapshot(baseArgs());
  assert.equal(snap.source.repoJsonUrl, REPO_URL);
  assert.equal(snap.source.groupRepo, 'MTVirux/SeaOfTerror');
});

test('one plugin entry per repo.json entry', () => {
  const snap = buildSnapshot(baseArgs());
  assert.equal(snap.plugins.length, repoJson.length);
});

test('plugin maps manifest fields with correct types', () => {
  const snap = buildSnapshot(baseArgs());
  const glam = snap.plugins.find((p) => p.internalName === 'GlamorousTerror');
  assert.ok(glam, 'GlamorousTerror should be present');
  assert.equal(glam.name, 'Glamourous Terror');
  assert.equal(glam.author, 'MTVirux');
  assert.equal(glam.manifest.stableVersion, '1.6.1.10');
  assert.equal(glam.manifest.testingVersion, '1.6.1.15');
  assert.equal(glam.manifest.dalamudApiLevel, 15);
  assert.equal(glam.manifest.downloadCount, 568);
  assert.equal(glam.manifest.isHide, false);
  assert.equal(glam.manifest.isTestingExclusive, false);
  assert.equal(glam.manifest.repoUrl, 'https://github.com/MTVirux/GlamorousTerror');
});

test('isHide/isTestingExclusive accept the string "False" from repo.json', () => {
  const fake = [{
    Author: 'A', Name: 'X', InternalName: 'X',
    AssemblyVersion: '1.0.0', TestingAssemblyVersion: '1.0.0',
    DalamudApiLevel: 15, TestingDalamudApiLevel: 15,
    DownloadCount: 0, LastUpdate: 0,
    RepoUrl: 'https://github.com/o/x', IconUrl: '',
    IsHide: 'False', IsTestingExclusive: 'True',
  }];
  const snap = buildSnapshot(baseArgs({ repoJson: fake }));
  assert.equal(snap.plugins[0].manifest.isHide, false);
  assert.equal(snap.plugins[0].manifest.isTestingExclusive, true);
});

test('plugin with no github data has github=null', () => {
  const snap = buildSnapshot(baseArgs());
  const glam = snap.plugins.find((p) => p.internalName === 'GlamorousTerror');
  assert.equal(glam.github, null);
});

test('plugin with full github data is mapped', () => {
  const ghByPlugin = {
    'MTVirux/GlamorousTerror': {
      repo: { default_branch: 'main', open_issues_count: 2, pushed_at: '2026-05-12T19:22:01Z' },
      releases: [{ tag_name: '1.6.1.10', published_at: '2026-05-10T03:11:00Z' }],
      runs: [{ conclusion: 'success', status: 'completed', name: 'build.yml',
               html_url: 'https://github.com/MTVirux/GlamorousTerror/actions/runs/111',
               updated_at: '2026-05-12T19:24:00Z' }],
    },
  };
  const snap = buildSnapshot(baseArgs({ ghByPlugin }));
  const g = snap.plugins.find((p) => p.internalName === 'GlamorousTerror').github;
  assert.equal(g.ok, true);
  assert.equal(g.lastCommitAt, '2026-05-12T19:22:01Z');
  assert.equal(g.openIssues, 2);
  assert.deepEqual(g.latestRelease, { tag: '1.6.1.10', publishedAt: '2026-05-10T03:11:00Z' });
  assert.equal(g.ci.status, 'success');
  assert.equal(g.ci.workflow, 'build.yml');
  assert.equal(g.ci.runUrl, 'https://github.com/MTVirux/GlamorousTerror/actions/runs/111');
  assert.equal(g.ci.ranAt, '2026-05-12T19:24:00Z');
});

test('plugin with github error gets ok:false but keeps manifest', () => {
  const ghByPlugin = { 'MTVirux/GlamorousTerror': { error: 'rate_limited' } };
  const snap = buildSnapshot(baseArgs({ ghByPlugin }));
  const p = snap.plugins.find((x) => x.internalName === 'GlamorousTerror');
  assert.equal(p.github.ok, false);
  assert.equal(p.github.reason, 'rate_limited');
  assert.equal(p.manifest.downloadCount, 568);
});

test('no runs means ci.status is "none"', () => {
  const ghByPlugin = {
    'MTVirux/GlamorousTerror': {
      repo: { default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-01T00:00:00Z' },
      releases: [], runs: [],
    },
  };
  const snap = buildSnapshot(baseArgs({ ghByPlugin }));
  const g = snap.plugins.find((p) => p.internalName === 'GlamorousTerror').github;
  assert.equal(g.ci.status, 'none');
  assert.equal(g.ci.runUrl, null);
});

test('in_progress run preserves the in_progress status', () => {
  const ghByPlugin = {
    'MTVirux/GlamorousTerror': {
      repo: { default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-01T00:00:00Z' },
      releases: [],
      runs: [{ conclusion: null, status: 'in_progress', name: 'build.yml', html_url: 'https://x', updated_at: '2026-05-14T00:00:00Z' }],
    },
  };
  const snap = buildSnapshot(baseArgs({ ghByPlugin }));
  assert.equal(snap.plugins.find((p) => p.internalName === 'GlamorousTerror').github.ci.status, 'in_progress');
});

test('releaseCount90d counts releases within 90 days', () => {
  const ghByPlugin = {
    'MTVirux/GlamorousTerror': {
      repo: { default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-10T00:00:00Z' },
      releases: [
        { tag_name: 'r1', published_at: '2026-05-10T00:00:00Z' },
        { tag_name: 'r2', published_at: '2026-04-01T00:00:00Z' },
        { tag_name: 'r3', published_at: '2026-02-15T00:00:00Z' },
        { tag_name: 'r4', published_at: '2026-02-13T00:00:00Z' },
        { tag_name: 'r5', published_at: '2025-12-01T00:00:00Z' },
      ],
      runs: [],
    },
  };
  const snap = buildSnapshot(baseArgs({ ghByPlugin }));
  assert.equal(snap.plugins.find((p) => p.internalName === 'GlamorousTerror').github.releaseCount90d, 3);
});

test('releaseCount90d is 0 with no releases', () => {
  const ghByPlugin = {
    'MTVirux/GlamorousTerror': {
      repo: { default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-10T00:00:00Z' },
      releases: [], runs: [],
    },
  };
  const snap = buildSnapshot(baseArgs({ ghByPlugin }));
  assert.equal(snap.plugins.find((p) => p.internalName === 'GlamorousTerror').github.releaseCount90d, 0);
});

test('top-level errors are passed through', () => {
  const snap = buildSnapshot(baseArgs({ errors: [{ stage: 'fetch-manifest', message: 'HTTP 503' }] }));
  assert.deepEqual(snap.errors, [{ stage: 'fetch-manifest', message: 'HTTP 503' }]);
});

test('empty repoJson produces zero plugins, schema still valid', () => {
  const snap = buildSnapshot(baseArgs({ repoJson: [] }));
  assert.equal(snap.schema, 1);
  assert.deepEqual(snap.plugins, []);
});
