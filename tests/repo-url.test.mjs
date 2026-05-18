import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepoJsonUrl, dataBranchName, groupRepoSlug, rawUrl } from '../lib/repo-url.mjs';

const SAMPLE = 'https://raw.githubusercontent.com/MTVirux/SeaOfTerror/main/repo.json';

test('parseRepoJsonUrl extracts owner, repo, ref, path', () => {
  assert.deepEqual(parseRepoJsonUrl(SAMPLE), {
    owner: 'MTVirux',
    repo: 'SeaOfTerror',
    ref: 'main',
    path: 'repo.json',
  });
});

test('parseRepoJsonUrl handles nested paths', () => {
  const url = 'https://raw.githubusercontent.com/owner/repo/main/sub/dir/manifest.json';
  assert.deepEqual(parseRepoJsonUrl(url), {
    owner: 'owner',
    repo: 'repo',
    ref: 'main',
    path: 'sub/dir/manifest.json',
  });
});

test('parseRepoJsonUrl throws on non-raw URLs', () => {
  assert.throws(() => parseRepoJsonUrl('https://github.com/foo/bar/blob/main/repo.json'));
});

test('dataBranchName prefixes the repo name', () => {
  assert.equal(dataBranchName(SAMPLE), 'repo/SeaOfTerror');
});

test('groupRepoSlug returns owner/repo', () => {
  assert.equal(groupRepoSlug(SAMPLE), 'MTVirux/SeaOfTerror');
});

test('rawUrl builds raw.githubusercontent URLs against the dashboard host repo, not the tracked repo', () => {
  assert.equal(
    rawUrl('MTVirux/LighthouseTerror', SAMPLE, 'data/latest.json'),
    'https://raw.githubusercontent.com/MTVirux/LighthouseTerror/repo/SeaOfTerror/data/latest.json'
  );
});
