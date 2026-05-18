// Parses a raw.githubusercontent.com URL pointing at a Dalamud custom plugin
// repo's manifest, and derives related URLs/identifiers used by both the
// snapshot script and the browser dashboard.

const RAW_HOST = 'raw.githubusercontent.com';

export function parseRepoJsonUrl(url) {
  const u = new URL(url);
  if (u.hostname !== RAW_HOST) {
    throw new Error(`Expected ${RAW_HOST}, got ${u.hostname}`);
  }
  const parts = u.pathname.replace(/^\/+/, '').split('/');
  if (parts.length < 4) {
    throw new Error(`Malformed raw URL: ${url}`);
  }
  const [owner, repo, ref, ...rest] = parts;
  return { owner, repo, ref, path: rest.join('/') };
}

export function dataBranchName(url) {
  const { repo } = parseRepoJsonUrl(url);
  return `repo/${repo}`;
}

export function groupRepoSlug(url) {
  const { owner, repo } = parseRepoJsonUrl(url);
  return `${owner}/${repo}`;
}

// hostSlug is the "owner/repo" of the dashboard's own repo (where the snapshot
// workflow committed the data branch) — NOT the tracked repo embedded in
// repoJsonUrl. The two differ whenever LighthouseTerror tracks an external repo.
export function rawUrl(hostSlug, repoJsonUrl, path) {
  const branch = dataBranchName(repoJsonUrl);
  return `https://${RAW_HOST}/${hostSlug}/${branch}/${path}`;
}
