import { buildSnapshot } from './transform.mjs';
import { RateLimitError, GithubError } from './github.mjs';
import { parseRepoJsonUrl } from '../../lib/repo-url.mjs';

const CONCURRENCY = 4;

function pluginKey(repoUrl) {
  if (!repoUrl) return null;
  const stripped = repoUrl.replace(/\.git$/, '').replace(/\/+$/, '');
  const u = new URL(stripped);
  const parts = u.pathname.replace(/^\/+/, '').split('/');
  if (parts.length < 2) return null;
  return { key: `${parts[0]}/${parts[1]}`, owner: parts[0], name: parts[1] };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let rateLimited = false;
  let resetAt = null;
  async function take() {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      if (rateLimited) {
        results[i] = { rateLimited: true };
        continue;
      }
      try {
        const value = await worker(items[i], i);
        // if rate limit hit by a concurrent worker while this one ran, discard result
        if (rateLimited) {
          results[i] = { rateLimited: true };
        } else {
          results[i] = { value };
        }
      } catch (err) {
        if (err instanceof RateLimitError) {
          rateLimited = true;
          resetAt = err.resetAt;
          results[i] = { rateLimited: true };
        } else {
          results[i] = { error: err };
        }
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => take()));
  return { results, rateLimited, resetAt };
}

async function fetchOnePluginGh(client, owner, name) {
  const repo = await client.getRepo(owner, name);
  const branch = repo.default_branch ?? 'main';
  const [releases, runs] = await Promise.all([
    client.getReleases(owner, name),
    client.getRuns(owner, name, branch),
  ]);
  return { repo, releases, runs };
}

export async function runSnapshot({ repoJsonUrl, manifestFetcher, githubClient, now }) {
  const errors = [];
  let repoJson;
  try {
    repoJson = await manifestFetcher(repoJsonUrl);
  } catch (err) {
    errors.push({ stage: 'fetch-manifest', message: err.message ?? String(err) });
    return buildSnapshot({
      repoJson: [], ghByPlugin: {}, repoJsonUrl,
      groupRepoMeta: { lastCommitAt: null, openIssues: 0, manifestLastModifiedAt: null },
      now, rateLimit: { ...githubClient.rateLimit }, errors,
    });
  }

  const targets = repoJson
    .map((entry) => ({ entry, key: pluginKey(entry.RepoUrl) }))
    .filter((t) => t.key !== null);

  const { results, rateLimited, resetAt } = await runWithConcurrency(
    targets, CONCURRENCY,
    async (t) => fetchOnePluginGh(githubClient, t.key.owner, t.key.name),
  );

  const ghByPlugin = {};
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    const r = results[i];
    if (r.value) {
      ghByPlugin[t.key.key] = r.value;
    } else if (r.rateLimited) {
      ghByPlugin[t.key.key] = { error: 'rate_limited' };
    } else if (r.error instanceof GithubError) {
      ghByPlugin[t.key.key] = { error: `http_${r.error.status}` };
    } else {
      ghByPlugin[t.key.key] = { error: 'unknown' };
    }
  }

  if (rateLimited) {
    errors.push({ stage: 'rate-limited', message: `GitHub rate limit hit; resets at ${resetAt}` });
  }

  let groupRepoMeta = { lastCommitAt: null, openIssues: 0, manifestLastModifiedAt: null };
  if (!rateLimited) {
    try {
      const { owner, repo } = parseRepoJsonUrl(repoJsonUrl);
      const groupRepoData = await githubClient.getRepo(owner, repo);
      groupRepoMeta = {
        lastCommitAt: groupRepoData.pushed_at ?? null,
        openIssues: groupRepoData.open_issues_count ?? 0,
        manifestLastModifiedAt: groupRepoData.pushed_at ?? null,
      };
    } catch (err) {
      if (!(err instanceof RateLimitError)) {
        errors.push({ stage: 'fetch-group-repo', message: err.message ?? String(err) });
      }
    }
  }

  return buildSnapshot({
    repoJson, ghByPlugin, repoJsonUrl, groupRepoMeta,
    now, rateLimit: { ...githubClient.rateLimit }, errors,
  });
}
