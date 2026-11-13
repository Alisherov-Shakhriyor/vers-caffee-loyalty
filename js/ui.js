/**
 * VERS CAFFEE LOYALTY — UI Components & Views
 * Preserves the exact coffee-inspired visual identity, tokens, and interactions.
 */

import { THRESHOLD, DAILY_LIMIT } from './config.js';

// Lucide-style SVG icon system matching existing prototype
export const IC = {
  home:'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  coffee:'<path d="M10 2v2M14 2v2M6 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>',
  gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  scan:'<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  nfc:'<path d="M6 8.3a7.4 7.4 0 0 1 0 7.4"/><path d="M9.5 6.2a11.8 11.8 0 0 1 0 11.6"/><path d="M12.9 4.1a15.9 15.9 0 0 1 0 15.8"/><path d="M16.4 2a20.2 20.2 0 0 1 0 20"/>',
  qr:'<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"/>',
  camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  ban:'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>'
};

export const icon = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
export const logo = (c = '') => `<svg class="logo ${c}" viewBox="90 150 340 255" role="img" aria-label="VERS CAFFEE"><use href="#logo-path"/></svg>`;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ini = n => (n || 'VC').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
export const isToday = iso => {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
};
export const fmtDate = iso => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmtTime = iso => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};
export const fmtDT = iso => isToday(iso) ? `Today, ${fmtTime(iso)}` : `${fmtDate(iso)}, ${fmtTime(iso)}`;

export const STATUS_BADGES = {
  success: ['ok', 'Success'],
  redeemed: ['ok', 'Reward Redeemed'],
  duplicate: ['warn', 'Duplicate'],
  invalid: ['danger', 'Invalid'],
  expired: ['warn', 'Expired'],
  blocked: ['danger', 'Blocked']
};

export const badge = (cls, label) => `<span class="badge ${cls}">${esc(label)}</span>`;
export const txBadge = s => badge(...(STATUS_BADGES[s] || ['warn', s]));

/**
 * Generates 10-stamp visual slots
 */
export function stampsHtml(stampsCount, flashIdx = -1) {
  return Array.from({ length: THRESHOLD }, (_, i) => {
    const on = i < stampsCount;
    const pop = flashIdx === i;
    return `<span class="slot ${on ? 'on' : ''} ${pop ? 'pop' : ''}">${on ? icon('check', 16) : i === THRESHOLD - 1 ? icon('coffee', 16) : ''}</span>`;
  }).join('');
}

/**
 * Transaction row in history or recent list
 */
export function txRow(t) {
  const isOk = t.status === 'success';
  const isRedeem = t.status === 'redeemed';
  const storeLabel = t.storeShort || t.storeName || 'VERS CAFFEE';
  const timeLabel = fmtDT(t.createdAt || t.ts);
  const methodLabel = t.method || 'QR';

  return `
    <div class="row">
      <div class="grow">
        <div class="t">${esc(storeLabel)}</div>
        <div class="m">${esc(methodLabel)} · ${esc(timeLabel)}</div>
      </div>
      ${isOk ? '<span class="ok-t">+1 stamp</span>' : isRedeem ? '<span class="ok-t">Free Coffee</span>' : txBadge(t.status)}
    </div>
  `;
}

/**
 * Toast notifications
 */
export function showToast(msg, type = 'ok') {
  const container = document.getElementById('toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'ok' ? 'check' : 'alert', 18)}<span>${esc(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .2s';
    setTimeout(() => el.remove(), 220);
  }, 2400);
}
