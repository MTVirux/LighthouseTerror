import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubClient, RateLimitError } from '../scripts/lib/github.mjs';

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-limit': '5000',
      'x-ratelimit-reset': '9999999999',
      ...headers,
    },
  });
}

test('getRepo sends Authorization header when token provided', async () => {
  let seenAuth;
  const fetch = async (_, opts) => {
    seenAuth = opts.headers.Authorization;
    return jsonResponse({ default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-10T00:00:00Z' });
  };
  await new GithubClient({ token: 'ghp_abc', fetch }).getRepo('o', 'n');
  assert.equal(seenAuth, 'Bearer ghp_abc');
});

test('getRepo omits Authorization when no token', async () => {
  let seenAuth = 'sentinel';
  const fetch = async (_, opts) => {
    seenAuth = opts.headers.Authorization;
    return jsonResponse({ default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-10T00:00:00Z' });
  };
  await new GithubClient({ token: null, fetch }).getRepo('o', 'n');
  assert.equal(seenAuth, undefined);
});

test('getRepo returns parsed JSON body', async () => {
  const fetch = async () => jsonResponse({ default_branch: 'main', open_issues_count: 5, pushed_at: '2026-05-10T00:00:00Z' });
  const got = await new GithubClient({ token: null, fetch }).getRepo('o', 'n');
  assert.deepEqual(got, { default_branch: 'main', open_issues_count: 5, pushed_at: '2026-05-10T00:00:00Z' });
});

test('rateLimit tracks the latest header values', async () => {
  const fetch = async () => jsonResponse({}, { headers: { 'x-ratelimit-remaining': '4823', 'x-ratelimit-reset': '1747400000' } });
  const c = new GithubClient({ token: null, fetch });
  await c.getRepo('o', 'n');
  assert.equal(c.rateLimit.remaining, 4823);
  assert.equal(c.rateLimit.limit, 5000);
  assert.equal(c.rateLimit.resetAt, new Date(1747400000 * 1000).toISOString());
});

test('non-2xx throws a GithubError with status', async () => {
  const fetch = async () => new Response('Not Found', { status: 404 });
  await assert.rejects(
    () => new GithubClient({ token: null, fetch }).getRepo('o', 'n'),
    (err) => err.status === 404,
  );
});

test('5xx is retried up to 3 times then thrown', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return new Response('boom', { status: 503 }); };
  const c = new GithubClient({ token: null, fetch, sleep: async () => {} });
  await assert.rejects(() => c.getRepo('o', 'n'), (err) => err.status === 503);
  assert.equal(calls, 4); // initial + 3 retries
});

test('5xx then 2xx succeeds', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    if (calls < 3) return new Response('boom', { status: 503 });
    return jsonResponse({ default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-10T00:00:00Z' });
  };
  const c = new GithubClient({ token: null, fetch, sleep: async () => {} });
  const got = await c.getRepo('o', 'n');
  assert.equal(got.default_branch, 'main');
  assert.equal(calls, 3);
});

test('4xx (non-429) is not retried', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return new Response('not found', { status: 404 }); };
  const c = new GithubClient({ token: null, fetch, sleep: async () => {} });
  await assert.rejects(() => c.getRepo('o', 'n'), (err) => err.status === 404);
  assert.equal(calls, 1);
});

test('network error is retried', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    if (calls < 2) throw new TypeError('fetch failed');
    return jsonResponse({ default_branch: 'main', open_issues_count: 0, pushed_at: '2026-05-10T00:00:00Z' });
  };
  const c = new GithubClient({ token: null, fetch, sleep: async () => {} });
  await c.getRepo('o', 'n');
  assert.equal(calls, 2);
});

test('rate-limit-zero response throws RateLimitError', async () => {
  const fetch = async () => new Response('rate limited', {
    status: 403,
    headers: {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-limit': '5000',
      'x-ratelimit-reset': '1747400000',
    },
  });
  const c = new GithubClient({ token: null, fetch, sleep: async () => {} });
  await assert.rejects(
    () => c.getRepo('o', 'n'),
    (err) => err.name === 'RateLimitError' && err.resetAt === new Date(1747400000 * 1000).toISOString(),
  );
});

test('rate-limit-zero is not retried', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response('rate limited', {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1747400000' },
    });
  };
  const c = new GithubClient({ token: null, fetch, sleep: async () => {} });
  await assert.rejects(() => c.getRepo('o', 'n'), (err) => err.name === 'RateLimitError');
  assert.equal(calls, 1);
});

test('getRuns returns the workflow_runs array, not the wrapper object', async () => {
  const fetch = async () => jsonResponse({
    total_count: 1,
    workflow_runs: [{ status: 'completed', conclusion: 'success', name: 'CI', html_url: 'u', updated_at: 't' }],
  });
  const got = await new GithubClient({ token: null, fetch }).getRuns('o', 'n', 'main');
  assert.ok(Array.isArray(got));
  assert.equal(got.length, 1);
  assert.equal(got[0].conclusion, 'success');
});

test('getRuns returns [] when workflow_runs is missing', async () => {
  const fetch = async () => jsonResponse({ total_count: 0 });
  const got = await new GithubClient({ token: null, fetch }).getRuns('o', 'n', 'main');
  assert.deepEqual(got, []);
});
