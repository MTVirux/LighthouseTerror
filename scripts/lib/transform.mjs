import { groupRepoSlug } from '../../lib/repo-url.mjs';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function countReleasesIn90d(releases, now) {
  const cutoff = now.getTime() - NINETY_DAYS_MS;
  return releases.filter((r) => {
    const t = Date.parse(r.published_at);
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}

function parseBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

function pluginGithubKey(repoUrl) {
  const stripped = repoUrl.replace(/\.git$/, '').replace(/\/+$/, '');
  const u = new URL(stripped);
  const parts = u.pathname.replace(/^\/+/, '').split('/');
  if (parts.length < 2) return null;
  return `${parts[0]}/${parts[1]}`;
}

function ciFromRuns(runs) {
  if (!runs || runs.length === 0) {
    return { status: 'none', workflow: null, runUrl: null, ranAt: null };
  }
  const run = runs[0];
  let status;
  if (run.status === 'in_progress' || run.status === 'queued' || run.status === 'pending') status = 'in_progress';
  else if (run.conclusion === 'success') status = 'success';
  else if (run.conclusion === 'failure' || run.conclusion === 'cancelled' || run.conclusion === 'timed_out') status = 'failure';
  else status = 'none';
  return {
    status,
    workflow: run.name ?? null,
    runUrl: run.html_url ?? null,
    ranAt: run.updated_at ?? null,
  };
}

function tagFromDownloadLink(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/releases\/download\/([^/]+)\//);
  return m ? decodeURIComponent(m[1]) : null;
}

function sumAssets(release) {
  return (release.assets ?? []).reduce((acc, a) => acc + (a.download_count ?? 0), 0);
}

function findByTags(releases, tags) {
  for (const t of tags) {
    if (!t) continue;
    const rel = releases.find((r) => r.tag_name === t);
    if (rel) return rel;
  }
  return null;
}

// Downloads of the releases currently served by the manifest's install/testing
// links. Tag is taken from the link URL when present (handles v-prefixed and
// testing_ tags), falling back to the bare/v-prefixed assembly version.
function releaseDownloads(entry, releases) {
  const stableRel = findByTags(releases, [
    tagFromDownloadLink(entry.DownloadLinkInstall),
    entry.AssemblyVersion,
    entry.AssemblyVersion ? `v${entry.AssemblyVersion}` : null,
  ]);
  const testingRel = findByTags(releases, [
    tagFromDownloadLink(entry.DownloadLinkTesting),
    entry.TestingAssemblyVersion ? `testing_${entry.TestingAssemblyVersion}` : null,
  ]);
  return {
    stable: stableRel ? sumAssets(stableRel) : null,
    testing: testingRel && testingRel !== stableRel ? sumAssets(testingRel) : null,
  };
}

function buildGithub(payload, fetchedAtIso, now, entry) {
  if (payload.error) {
    return { ok: false, reason: payload.error, fetchedAt: fetchedAtIso };
  }
  const { repo, releases = [], runs = [] } = payload;
  const latestRelease = releases.length > 0
    ? { tag: releases[0].tag_name, publishedAt: releases[0].published_at }
    : null;
  return {
    ok: true,
    fetchedAt: fetchedAtIso,
    lastCommitAt: repo?.pushed_at ?? null,
    openIssues: repo?.open_issues_count ?? 0,
    latestRelease,
    releaseCount90d: countReleasesIn90d(releases, now),
    releaseDownloads: releaseDownloads(entry, releases),
    ci: ciFromRuns(runs),
  };
}

function mapManifestEntry(entry, ghByPlugin, fetchedAtIso, now) {
  const repoUrl = entry.RepoUrl ?? null;
  const key = repoUrl ? pluginGithubKey(repoUrl) : null;
  const ghPayload = key ? ghByPlugin[key] : null;
  return {
    internalName: entry.InternalName,
    name: entry.Name,
    author: entry.Author,
    iconUrl: entry.IconUrl ?? null,
    manifest: {
      stableVersion: entry.AssemblyVersion ?? null,
      testingVersion: entry.TestingAssemblyVersion ?? null,
      dalamudApiLevel: entry.DalamudApiLevel ?? null,
      testingDalamudApiLevel: entry.TestingDalamudApiLevel ?? null,
      lastUpdate: entry.LastUpdate ?? null,
      downloadCount: entry.DownloadCount ?? 0,
      isHide: parseBool(entry.IsHide),
      isTestingExclusive: parseBool(entry.IsTestingExclusive),
      repoUrl,
    },
    github: ghPayload ? buildGithub(ghPayload, fetchedAtIso, now, entry) : null,
  };
}

export function buildSnapshot({ repoJson, ghByPlugin, repoJsonUrl, groupRepoMeta, now, rateLimit, errors = [] }) {
  const snapshotAt = now.toISOString();
  const plugins = repoJson.map((e) => mapManifestEntry(e, ghByPlugin, snapshotAt, now));
  return {
    schema: 1,
    snapshotAt,
    source: { repoJsonUrl, groupRepo: groupRepoSlug(repoJsonUrl) },
    groupRepo: { ...groupRepoMeta },
    plugins,
    rateLimit: { ...rateLimit },
    errors,
  };
}
