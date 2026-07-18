import { el } from '../dom.js';

function daysSince(epochOrIso, now = new Date()) {
  if (epochOrIso == null) return null;
  const t = typeof epochOrIso === 'number' ? epochOrIso * 1000 : Date.parse(epochOrIso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000));
}

function ageText(days) {
  if (days == null) return '—';
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function ageClass(days) {
  if (days == null) return '';
  return days > 7 ? 'age stale' : 'age';
}

function versionCell(p) {
  const stable = p.manifest.stableVersion ?? '—';
  const testing = p.manifest.testingVersion;
  if (testing && testing !== stable) {
    return el('span', null,
      el('span', { class: 'ver' }, stable),
      ' ',
      el('span', { class: 'ver ver-drift' }, `→ ${testing}t`),
    );
  }
  return el('span', { class: 'ver' }, stable);
}

function apiCell(p, maxApi) {
  const api = p.manifest.dalamudApiLevel;
  if (api == null) return el('span', { class: 'pillc muted' }, '—');
  const cls = api === maxApi ? 'muted' : 'warn';
  return el('span', { class: `pillc ${cls}` }, String(api));
}

function ciCell(p) {
  if (!p.github) return el('span', { class: 'pillc muted' }, '—');
  if (!p.github.ok) return el('span', { class: 'pillc muted', title: 'GitHub data unavailable' }, 'stale');
  const s = p.github.ci.status;
  if (s === 'success') return el('span', { class: 'pillc ok' }, 'pass');
  if (s === 'failure') return el('span', { class: 'pillc bad' }, 'fail');
  if (s === 'in_progress') return el('span', { class: 'pillc warn' }, 'running');
  return el('span', { class: 'pillc muted' }, 'n/a');
}

function releaseDownloadsCell(p) {
  const rd = p.github?.ok ? p.github.releaseDownloads : null;
  if (!rd) return el('span', { class: 'muted' }, '—');
  const stable = rd.stable == null ? '—' : rd.stable.toLocaleString('en-US');
  if (rd.testing == null) return el('span', null, stable);
  return el('span', null,
    stable,
    ' ',
    el('span', { class: 'ver-drift' }, `+${rd.testing.toLocaleString('en-US')}t`),
  );
}

function ghVal(p, fn) {
  if (!p.github || !p.github.ok) return '—';
  return fn(p.github);
}

// repoUrl comes from third-party manifests; only allow http(s) hrefs so a
// crafted javascript: URI can't execute when the name link is clicked.
function safeHref(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export function renderPluginTable(snap) {
  const maxApi = Math.max(0, ...snap.plugins.map((p) => p.manifest.dalamudApiLevel ?? 0));
  const rows = snap.plugins.map((p) => {
    const updateDays = daysSince(p.manifest.lastUpdate);
    const commitDays = p.github?.ok ? daysSince(p.github.lastCommitAt) : null;
    const icon = el('img', { class: 'picon', src: p.iconUrl ?? '', alt: '', onerror: function () { this.style.visibility = 'hidden'; } });
    const repoUrl = safeHref(p.manifest.repoUrl);
    const title = repoUrl
      ? el('a', { class: 'pname-t', href: repoUrl, target: '_blank', rel: 'noopener noreferrer', title: 'Open repository' }, p.name)
      : el('div', { class: 'pname-t' }, p.name);
    return el('tr', null,
      el('td', null,
        el('div', { class: 'pname' },
          icon,
          el('div', { class: 'pname-l' },
            title,
            el('div', { class: 'pname-s' }, p.internalName),
          ),
        ),
      ),
      el('td', null, versionCell(p)),
      el('td', null, apiCell(p, maxApi)),
      el('td', { class: ageClass(updateDays) }, ageText(updateDays)),
      el('td', { class: 'right num' }, (p.manifest.downloadCount ?? 0).toLocaleString('en-US')),
      el('td', { class: 'right num' }, releaseDownloadsCell(p)),
      el('td', { class: 'right num' }, String(ghVal(p, (g) => g.openIssues))),
      el('td', { class: `right ${ageClass(commitDays)}` }, commitDays == null ? '—' : `${commitDays}d`),
      el('td', { class: 'right' }, ciCell(p)),
    );
  });

  const head = el('tr', null,
    el('th', null, 'Plugin'),
    el('th', null, 'Version'),
    el('th', null, 'API'),
    el('th', null, 'Last update'),
    el('th', { class: 'right' }, 'Downloads'),
    el('th', { class: 'right', title: 'Downloads of the current stable release (+testing) via GitHub release assets' }, 'This ver.'),
    el('th', { class: 'right' }, 'Issues'),
    el('th', { class: 'right' }, 'Last commit'),
    el('th', { class: 'right' }, 'CI'),
  );

  return el('div', null,
    el('div', { class: 'section-head' }, 'Plugins'),
    el('div', { class: 'table-wrap' },
      el('table', { class: 'plugins' },
        el('thead', null, head),
        el('tbody', null, ...rows),
      ),
    ),
  );
}
