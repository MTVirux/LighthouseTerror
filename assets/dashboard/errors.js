import { el } from '../dom.js';

export function renderBanner(snap) {
  if (!snap.errors || snap.errors.length === 0) return null;
  const items = snap.errors.map((e) =>
    el('li', null,
      el('span', { class: 'mono' }, `[${e.stage}]`),
      ' ',
      e.message ?? '',
    )
  );
  return el('div', { class: 'banner' },
    el('span', null, '⚠'),
    el('details', null,
      el('summary', null, `Last snapshot had partial failures (${snap.errors.length})`),
      el('ul', null, ...items),
    ),
  );
}

export function renderEmptyState(repoJsonUrl, actionsUrl) {
  return el('div', { class: 'empty' },
    el('h3', null, 'No snapshots yet'),
    el('p', null, 'The first cron run is pending. The dashboard refreshes every 6 hours, or trigger it manually:'),
    el('p', null,
      el('a', { href: actionsUrl, target: '_blank', rel: 'noopener' },
        'Open the snapshot workflow on GitHub →'),
    ),
    el('p', { class: 'mono', style: { fontSize: '11px', opacity: '0.5' } },
      'Tracking: ', repoJsonUrl),
  );
}

export function renderSchemaError(actual) {
  return el('div', { class: 'empty' },
    el('h3', null, 'Snapshot schema mismatch'),
    el('p', null,
      'This dashboard expects ',
      el('span', { class: 'mono' }, 'schema: 1'),
      ' — got ',
      el('span', { class: 'mono' }, String(actual)),
      '.',
    ),
    el('p', null, 'Update the dashboard or revert the snapshot.'),
  );
}
