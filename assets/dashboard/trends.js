import { el } from '../dom.js';
import { areaChart, barChart, lineChart } from '../charts.js';

function ts(iso) { return Math.floor(Date.parse(iso) / 1000); }

function seriesDownloads(history) {
  const x = history.map((s) => ts(s.snapshotAt));
  const y = history.map((s) => s.plugins.reduce((acc, p) => acc + (p.manifest.downloadCount ?? 0), 0));
  return [x, y];
}

function seriesReleasesPerWeek(history) {
  const x = history.map((s) => ts(s.snapshotAt));
  const y = history.map((s) => {
    const cutoff = Date.parse(s.snapshotAt) - 7 * 24 * 60 * 60 * 1000;
    return s.plugins.reduce((acc, p) => {
      if (!p.github?.ok || !p.github.latestRelease) return acc;
      const t = Date.parse(p.github.latestRelease.publishedAt);
      return acc + (t >= cutoff ? 1 : 0);
    }, 0);
  });
  return [x, y];
}

function seriesBuildPassRate(history) {
  const x = history.map((s) => ts(s.snapshotAt));
  const y = history.map((s) => {
    const known = s.plugins.filter((p) => p.github?.ok && p.github.ci.status !== 'none');
    if (known.length === 0) return null;
    return known.filter((p) => p.github.ci.status === 'success').length / known.length;
  });
  return [x, y];
}

function seriesApiConformance(history) {
  const x = history.map((s) => ts(s.snapshotAt));
  const y = history.map((s) => {
    const max = Math.max(0, ...s.plugins.map((p) => p.manifest.dalamudApiLevel ?? 0));
    const conform = s.plugins.filter((p) => (p.manifest.dalamudApiLevel ?? 0) === max).length;
    return s.plugins.length > 0 ? conform / s.plugins.length : null;
  });
  return [x, y];
}

function chartSkeleton(id, label) {
  return el('div', { class: 'chart' },
    el('div', { class: 'chart-head' },
      el('span', { class: 'chart-name' }, label),
    ),
    el('div', { class: 'chart-val mono', 'data-trend-val': id }),
    el('div', { id: `trend-${id}` }),
  );
}

export function renderTrends(history) {
  if (!history || history.length < 2) {
    return el('div', null,
      el('div', { class: 'section-head' }, 'Trends · 90 days'),
      el('div', { class: 'empty', style: { padding: '30px' } },
        'Trends will appear once at least two snapshots exist.'),
    );
  }
  return el('div', null,
    el('div', { class: 'section-head' }, 'Trends · 90 days'),
    el('div', { class: 'trends' },
      chartSkeleton('downloads', 'Downloads'),
      chartSkeleton('releases', 'Releases / week'),
      chartSkeleton('builds', 'Build pass rate'),
      chartSkeleton('api', 'API conformance'),
    ),
  );
}

export function mountTrends(history) {
  if (!history || history.length < 2) return;
  const downloadsData = seriesDownloads(history);
  const releasesData = seriesReleasesPerWeek(history);
  const buildsData = seriesBuildPassRate(history);
  const apiData = seriesApiConformance(history);

  const m = (id) => document.getElementById(id);
  if (m('trend-downloads')) areaChart(m('trend-downloads'), downloadsData);
  if (m('trend-releases')) barChart(m('trend-releases'), releasesData);
  if (m('trend-builds')) lineChart(m('trend-builds'), buildsData, { color: '#4ade80' });
  if (m('trend-api')) lineChart(m('trend-api'), apiData, { color: '#fbbf24' });

  const setVal = (key, text) => {
    const v = document.querySelector(`[data-trend-val="${key}"]`);
    if (v) v.textContent = text;
  };
  setVal('downloads', String(downloadsData[1][downloadsData[1].length - 1]));
  setVal('releases', String(releasesData[1][releasesData[1].length - 1]));
  const lb = buildsData[1][buildsData[1].length - 1];
  setVal('builds', lb == null ? '—' : `${Math.round(lb * 100)}%`);
  const la = apiData[1][apiData[1].length - 1];
  setVal('api', la == null ? '—' : `${Math.round(la * 100)}%`);
}
