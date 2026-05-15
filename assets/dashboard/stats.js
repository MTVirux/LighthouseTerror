import { el } from '../dom.js';

function tile(label, num, delta, deltaClass = '') {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat-label' }, label),
    el('div', { class: 'stat-num' }, num),
    el('div', { class: `stat-delta ${deltaClass}` }, delta),
  );
}

function previousTotalDownloads(history) {
  if (!history || history.length < 2) return null;
  const latest = history[history.length - 1];
  const cutoff = new Date(latest.snapshotAt).getTime() - 7 * 24 * 60 * 60 * 1000;
  for (let i = history.length - 2; i >= 0; i -= 1) {
    if (new Date(history[i].snapshotAt).getTime() <= cutoff) {
      return history[i].plugins.reduce((acc, p) => acc + (p.manifest.downloadCount ?? 0), 0);
    }
  }
  return history[0].plugins.reduce((acc, p) => acc + (p.manifest.downloadCount ?? 0), 0);
}

export function renderHeroStats(snap, history) {
  const totalDownloads = snap.plugins.reduce((acc, p) => acc + (p.manifest.downloadCount ?? 0), 0);
  const prev = previousTotalDownloads(history);
  const delta = prev != null ? totalDownloads - prev : null;

  const pluginCount = snap.plugins.length;
  const testingOnly = snap.plugins.filter((p) => p.manifest.isTestingExclusive).length;

  const maxApi = Math.max(0, ...snap.plugins.map((p) => p.manifest.dalamudApiLevel ?? 0));
  const onLatest = snap.plugins.filter((p) => (p.manifest.dalamudApiLevel ?? 0) === maxApi).length;

  const ciKnown = snap.plugins.filter((p) => p.github?.ok && p.github.ci.status !== 'none');
  const ciPassing = ciKnown.filter((p) => p.github.ci.status === 'success').length;

  const issuesPerPlugin = snap.plugins.reduce((acc, p) => acc + (p.github?.ok ? p.github.openIssues : 0), 0);
  const issuesGroup = snap.groupRepo?.openIssues ?? 0;

  return el('div', { class: 'hero' },
    tile('downloads', totalDownloads.toLocaleString('en-US'),
      delta != null ? `${delta >= 0 ? '+' : ''}${delta} this week` : '—',
      delta != null && delta > 0 ? 'up' : ''),
    tile('plugins', pluginCount, `${testingOnly} testing-only`),
    tile('on latest api', `${onLatest}/${pluginCount}`, `${pluginCount - onLatest} behind api ${maxApi}`),
    tile('builds passing', `${ciPassing}/${ciKnown.length || 0}`, `${(ciKnown.length || 0) - ciPassing} failing`),
    tile('open issues', issuesPerPlugin + issuesGroup, `${issuesGroup} on group repo`),
  );
}
