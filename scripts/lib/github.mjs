const API = 'https://api.github.com';
const BACKOFF_MS = [250, 500, 1000];

export class GithubError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'GithubError';
    this.status = status ?? null;
    this.body = body ?? null;
  }
}

export class RateLimitError extends Error {
  constructor(resetAt) {
    super(`GitHub rate limit exhausted (resets at ${resetAt})`);
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

function isRetryable(err, res) {
  if (err) return true;
  if (!res) return false;
  if (res.status >= 500 && res.status < 600) return true;
  if (res.status === 429) return true;
  return false;
}

export class GithubClient {
  constructor({ token = null, fetch = globalThis.fetch, sleep } = {}) {
    this.token = token;
    this.fetch = fetch;
    this.sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.rateLimit = { remaining: null, limit: null, resetAt: null };
  }

  async _get(path) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'LighthouseTerror',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let lastRes = null;
    let lastErr = null;
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt += 1) {
      if (attempt > 0) await this.sleep(BACKOFF_MS[attempt - 1]);
      try {
        const res = await this.fetch(`${API}${path}`, { method: 'GET', headers });
        this._absorbRateLimit(res);
        if (res.ok) return res.json();

        if (res.status === 403 && this.rateLimit.remaining === 0) {
          throw new RateLimitError(this.rateLimit.resetAt);
        }

        lastRes = res;
        lastErr = null;
        if (!isRetryable(null, res)) break;
      } catch (err) {
        if (err instanceof RateLimitError) throw err;
        lastErr = err;
        lastRes = null;
        if (!isRetryable(err, null)) throw err;
      }
    }
    if (lastErr) throw lastErr;
    const text = await lastRes.text().catch(() => '');
    throw new GithubError(`GitHub ${lastRes.status} for ${path}`, { status: lastRes.status, body: text });
  }

  _absorbRateLimit(res) {
    const rem = Number(res.headers.get('x-ratelimit-remaining'));
    const lim = Number(res.headers.get('x-ratelimit-limit'));
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(rem)) this.rateLimit.remaining = rem;
    if (Number.isFinite(lim)) this.rateLimit.limit = lim;
    if (Number.isFinite(reset)) this.rateLimit.resetAt = new Date(reset * 1000).toISOString();
  }

  async getRepo(owner, name) { return this._get(`/repos/${owner}/${name}`); }
  async getReleases(owner, name) { return this._get(`/repos/${owner}/${name}/releases?per_page=30`); }
  async getRuns(owner, name, branch) {
    const b = encodeURIComponent(branch);
    return this._get(`/repos/${owner}/${name}/actions/runs?per_page=1&branch=${b}`);
  }
}
