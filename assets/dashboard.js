import { REPO_JSON_URL } from '../config.js';
import { rawUrl, groupRepoSlug, parseRepoJsonUrl } from '../lib/repo-url.mjs';
import { el, mount } from './dom.js';
import { renderTopBar } from './dashboard/topbar.js';
import { renderHeroStats } from './dashboard/stats.js';
import { renderTrends, mountTrends } from './dashboard/trends.js';
import { renderPluginTable } from './dashboard/table.js';
import { renderBanner, renderEmptyState, renderSchemaError } from './dashboard/errors.js';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const app = document.getElementById('app');

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function actionsUrl() {
  const host = window.location.host;
  if (host.endsWith('.github.io')) {
    const owner = host.replace('.github.io', '');
    const repo = window.location.pathname.split('/').filter(Boolean)[0] ?? 'LighthouseTerror';
    return `https://github.com/${owner}/${repo}/actions`;
  }
  return `https://github.com/${groupRepoSlug(REPO_JSON_URL)}/actions`;
}

async function loadLatest() {
  return fetchJson(rawUrl(REPO_JSON_URL, 'data/latest.json'));
}

async function loadHistory() {
  const { owner, repo } = parseRepoJsonUrl(REPO_JSON_URL);
  const branch = `repo/${repo}`;
  const listUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/snapshots?ref=${encodeURIComponent(branch)}`;
  let items;
  try {
    items = await fetchJson(listUrl);
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
  const cutoff = Date.now() - NINETY_DAYS_MS;
  const recent = items
    .filter((it) => /^\d{4}-\d{2}-\d{2}\.json$/.test(it.name))
    .filter((it) => Date.parse(it.name.replace('.json', 'T00:00:00Z')) >= cutoff)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  return Promise.all(recent.map((it) => fetchJson(it.download_url)));
}

function renderFooter(snap) {
  return el('div', { class: 'foot' },
    el('div', null,
      'snapshot ',
      el('span', { class: 'mono' }, snap.snapshotAt),
      ' · refreshes every ',
      el('span', { class: 'mono' }, '6h'),
    ),
    el('div', null,
      'source ',
      el('span', { class: 'mono' }, snap.source.repoJsonUrl),
    ),
  );
}

function render(snap, history) {
  if (snap.schema !== 1) {
    mount(app, renderSchemaError(snap.schema));
    return;
  }
  const children = [
    renderTopBar(snap),
    renderBanner(snap),
    renderHeroStats(snap, history),
    renderTrends(history),
    renderPluginTable(snap),
    renderFooter(snap),
  ].filter(Boolean);
  mount(app, ...children);
  mountTrends(history);
}

async function main() {
  let snap;
  try {
    snap = await loadLatest();
  } catch (err) {
    if (err.status === 404) {
      mount(app, renderEmptyState(REPO_JSON_URL, actionsUrl()));
      return;
    }
    mount(app, el('div', { class: 'empty' },
      el('h3', null, 'Failed to load snapshot'),
      el('p', { class: 'mono' }, err.message ?? String(err)),
    ));
    return;
  }
  const history = await loadHistory().catch(() => []);
  render(snap, history);
}

main();
