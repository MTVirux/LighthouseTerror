import { REPO_JSON_URL } from '../config.js';
import { rawUrl, groupRepoSlug, dataBranchName } from '../lib/repo-url.mjs';
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

// Detects "owner/repo" of the repo currently serving the dashboard (where the
// snapshot workflow committed the data branch). Returns null off github.io so
// local dev can fall back to working-copy data instead of hitting the network.
function dashboardHostSlug() {
  const host = window.location.host;
  if (!host.endsWith('.github.io')) return null;
  const owner = host.replace('.github.io', '');
  const repo = window.location.pathname.split('/').filter(Boolean)[0] ?? 'LighthouseTerror';
  return `${owner}/${repo}`;
}

function actionsUrl() {
  const slug = dashboardHostSlug() ?? groupRepoSlug(REPO_JSON_URL);
  return `https://github.com/${slug}/actions`;
}

async function loadLatest() {
  const slug = dashboardHostSlug();
  if (!slug) return fetchJson('./data/latest.json');
  return fetchJson(rawUrl(slug, REPO_JSON_URL, 'data/latest.json'));
}

async function loadHistory() {
  const slug = dashboardHostSlug();
  if (!slug) return [];
  const [owner, repo] = slug.split('/');
  const branch = dataBranchName(REPO_JSON_URL);
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
