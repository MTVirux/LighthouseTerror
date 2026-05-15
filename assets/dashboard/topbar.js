import { el } from '../dom.js';

function formatRelative(iso, now = new Date()) {
  if (!iso) return '—';
  const diffMs = now.getTime() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function displayName(snap) {
  return snap.source.groupRepo.split('/')[1].replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function renderTopBar(snap) {
  const groupRepo = snap.source.groupRepo;
  const pluginCount = snap.plugins.length;
  const rate = snap.rateLimit;

  const right = el('div', { class: 'topbar-r' });
  if (rate?.remaining != null) {
    right.appendChild(el('span', { class: 'pill' },
      el('span', { class: 'mono' }, `${rate.remaining}/${rate.limit}`),
      ' rate',
    ));
  }
  right.appendChild(el('span', { class: 'pill ok' },
    'snapshot ',
    el('span', { class: 'mono' }, formatRelative(snap.snapshotAt)),
  ));
  right.appendChild(el('a', {
    class: 'pill',
    href: `https://github.com/${groupRepo}`,
    target: '_blank',
    rel: 'noopener',
  }, 'repo ↗'));

  return el('div', { class: 'topbar' },
    el('div', { class: 'topbar-l' },
      el('div', { class: 'logo' },
        el('span', { class: 'logo-dot' }),
        ' ',
        displayName(snap),
      ),
      el('div', { class: 'sub' },
        'tracking ',
        el('span', { class: 'mono' }, groupRepo),
        ` · ${pluginCount} plugin${pluginCount === 1 ? '' : 's'}`,
      ),
    ),
    right,
  );
}
