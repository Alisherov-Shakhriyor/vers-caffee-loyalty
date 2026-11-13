/**
 * VERS CAFFEE LOYALTY — Main Application Orchestrator
 * Integrates real Firebase, Telegram WebApp Identity, Firestore Real-Time Sync,
 * Real QR Camera Scanner, and NFC Tag Detection.
 */

import { THRESHOLD, DAILY_LIMIT, DEFAULT_STORE } from './config.js';
import { authenticateTelegram, getTelegramWebApp } from './telegram-auth.js';
import { subscribeToCard, subscribeToTransactions } from './firebase.js';
import { collectStamp, redeemReward, getActiveStores } from './api.js';
import { 
  IC, icon, logo, esc, ini, fmtDate, fmtDT, isToday,
  stampsHtml, txRow, showToast 
} from './ui.js';

// Application State
const state = {
  user: null,
  card: { stamps: 0, totalStampsEarned: 0, rewardsEarned: 0, rewardsRedeemed: 0 },
  transactions: [],
  stores: [],
  activeView: 'home',
  theme: localStorage.getItem('vers_theme') || 'light',
  historyFilter: 'all',
  activeStore: DEFAULT_STORE,
  sheet: null,
  isScanning: false,
  html5QrScanner: null
};

const $ = (s, r = document) => r.querySelector(s);

// Theme management
function applyTheme() {
  const t = state.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : state.theme;
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'dark' ? '#17110D' : '#F6F0E8';
}

function hasCollectedToday() {
  return state.transactions.some(t => t.status === 'success' && isToday(t.createdAt || t.ts));
}

// ==========================================
// VIEWS
// ==========================================

function renderHome() {
  const u = state.user;
  const k = state.card;
  const left = THRESHOLD - k.stamps;
  const done = left <= 0;
  const recent = state.transactions.slice(0, 3);
  const firstName = u ? (u.firstName || u.username || 'Friend') : 'Guest';
  const username = u && u.username ? `@${u.username}` : (u ? `ID: ${u.telegramId}` : '');

  return `
    <header class="c-head">
      <div class="brand">${logo('lg')}<span>VERS CAFFEE</span></div>
      <button class="icon-btn" data-action="nav" data-view="profile" aria-label="Profile">
        <span class="av sm">${ini(u ? (u.firstName + ' ' + (u.lastName || '')) : 'VC')}</span>
      </button>
    </header>

    <p class="hello">Hello, ${esc(firstName)} <span>· ${esc(username)}</span></p>

    <section class="lcard" aria-label="Loyalty card">
      <div class="lc-name">Valid at all branches</div>
      <div class="stamps" style="--cols:5">${stampsHtml(k.stamps)}</div>
      <div class="lc-count"><strong>${k.stamps}</strong> of ${THRESHOLD} stamps</div>
      <p class="lc-msg">${done ? 'Reward ready — show this card at the counter' : `${left} more stamp${left > 1 ? 's' : ''} until your reward`}</p>
    </section>

    <div class="actions">
      ${done ? `<button class="btn primary block" data-action="redeemReward">Redeem reward</button>` : ''}
      <button class="btn ${done ? '' : 'primary'} block" data-action="openCollectSheet">
        ${icon('scan')}Collect Stamp
      </button>
    </div>

    <div class="sec">
      <h2>Recent</h2>
      <button data-action="nav" data-view="history">See all</button>
    </div>

    <div class="flat">
      ${recent.map(txRow).join('') || '<p class="m">No activity yet</p>'}
    </div>
  `;
}

function renderHistory() {
  const f = state.historyFilter;
  let list = [...state.transactions];

  if (f === 'ok') list = list.filter(t => t.status === 'success' || t.status === 'redeemed');
  else if (f === 'bad') list = list.filter(t => t.status !== 'success' && t.status !== 'redeemed');

  const label = iso => {
    if (isToday(iso)) return 'Today';
    const d = new Date(iso);
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return fmtDate(iso);
  };

  const groups = {};
  list.forEach(t => {
    const g = label(t.createdAt || t.ts);
    (groups[g] = groups[g] || []).push(t);
  });

  return `
    <header class="c-head"><h1 style="font-size:22px;font-weight:600">History</h1></header>
    <div class="chips">
      ${[['all', 'All'], ['ok', 'Collected'], ['bad', 'Failed']].map(([v, l]) => `
        <button class="chip ${f === v ? 'on' : ''}" data-action="setHistoryFilter" data-k="${v}">${l}</button>
      `).join('')}
    </div>
    ${Object.keys(groups).length ? Object.entries(groups).map(([g, items]) => `
      <div class="grp">${esc(g)}</div>
      <div class="flat">${items.map(txRow).join('')}</div>
    `).join('') : `
      <div class="empty">${icon('clock', 24)}<p>Nothing here yet</p></div>
    `}
  `;
}

function renderProfile() {
  const u = state.user || {};
  const k = state.card;
  const stamps = (k.totalStampsEarned !== undefined) ? k.totalStampsEarned : (k.stamps + (k.rewardsRedeemed || 0) * THRESHOLD);
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'VERS Customer';
  const kv = (l, v) => `<div class="row"><span class="grow m">${l}</span><span class="t">${esc(v)}</span></div>`;

  return `
    <header class="c-head"><h1 style="font-size:22px;font-weight:600">Profile</h1></header>
    <div class="me" style="margin:8px 0 12px">
      <span class="av lg">${ini(fullName)}</span>
      <div>
        <div class="t" style="font-size:17px">${esc(fullName)}</div>
        <div class="m">@${esc(u.username || 'customer')}</div>
      </div>
    </div>
    <div class="flat">
      ${kv('Telegram ID', u.telegramId || '—')}
      ${kv('Joined', fmtDate(u.createdAt || u.joined))}
      ${kv('Total stamps', stamps)}
      ${kv('Rewards earned', k.rewardsEarned || 0)}
      ${kv('Rewards redeemed', k.rewardsRedeemed || 0)}
    </div>
    <div class="sec"><h2>Settings</h2></div>
    <div class="flat">
      <label class="row">
        <span class="grow">Dark mode</span>
        <span class="sw">
          <input type="checkbox" data-change="darkToggle" ${document.documentElement.dataset.theme === 'dark' ? 'checked' : ''}>
          <span></span>
        </span>
      </label>
    </div>
  `;
}

function renderMainView() {
  applyTheme();
  let content = '';
  if (state.activeView === 'home') content = renderHome();
  else if (state.activeView === 'history') content = renderHistory();
  else if (state.activeView === 'profile') content = renderProfile();

  const nav = [
    ['home', 'Home', 'home'],
    ['history', 'History', 'clock'],
    ['profile', 'Profile', 'user']
  ];

  const html = `
    <div class="phone">
      <main class="cscreen" id="main" tabindex="-1">${content}</main>
      <nav class="bnav" aria-label="Main">
        ${nav.map(([id, label, ic]) => `
          <button class="${id === state.activeView ? 'on' : ''}" data-action="nav" data-view="${id}" ${id === state.activeView ? 'aria-current="page"' : ''}>
            ${icon(ic, 22)}<span>${label}</span>
          </button>
        `).join('')}
      </nav>
    </div>
  `;
  $('#app').innerHTML = html;
}

// ==========================================
// BOTTOM SHEET (STAMP COLLECTION)
// ==========================================

const shHeader = (t, sub) => `<h2>${t}</h2><p class="sub">${sub}</p>`;

function renderSheetBody() {
  const s = state.sheet;
  if (!s) return '';

  switch (s.step) {
    case 'choose': {
      const activeStores = state.stores.length ? state.stores : [
        { publicCode: 'VERS_CAFFEE_MAIN', name: 'Vers Caffee Main', short: 'Main Branch' },
        { publicCode: 'VC-CHL', name: 'Vers Caffee Chilonzor', short: 'Chilonzor' },
        { publicCode: 'VC-YUN', name: 'Vers Caffee Yunusobod', short: 'Yunusobod' },
        { publicCode: 'VC-MIR', name: 'Vers Caffee Mirobod', short: 'Mirobod' }
      ];
      return `
        ${shHeader('Collect stamp', 'Scan the QR code or tap the NFC tag at the counter')}
        <label class="fld" style="margin-bottom:12px">
          <span>Branch</span>
          <select class="in" data-change="selectSheetStore">
            ${activeStores.map(st => `<option value="${esc(st.publicCode)}"${st.publicCode === s.store ? ' selected' : ''}>${esc(st.name || st.short)}</option>`).join('')}
          </select>
        </label>
        <button class="opt" data-action="startQrScanner">
          <span class="ib">${icon('qr', 22)}</span>
          <span><div class="t">Scan QR Code</div><div class="m">Open camera to scan counter QR</div></span>
        </button>
        <button class="opt" data-action="startNfcRead">
          <span class="ib">${icon('nfc', 22)}</span>
          <span><div class="t">NFC Tag Tap</div><div class="m">Tap phone on the counter NFC tag</div></span>
        </button>
        <button class="btn block ghost" data-action="closeSheet">Cancel</button>
      `;
    }
    case 'qr_scanner': {
      return `
        ${shHeader('Scan QR Code', 'Point camera at the VERS CAFFEE counter QR')}
        <div id="qr-reader" style="width:100%;max-width:280px;margin:12px auto;border-radius:12px;overflow:hidden;background:#000;"></div>
        <p class="m center" style="margin:8px 0 14px">Align the QR code within the frame to scan</p>
        <button class="btn block ghost" data-action="stopQrAndClose">Cancel</button>
      `;
    }
    case 'nfc_wait': {
      return `
        ${shHeader('NFC Tag Tap', 'Hold your phone near the VERS CAFFEE tag')}
        <div class="nfc">${icon('nfc', 48)}</div>
        <div class="note">${icon('info', 16)}<span>Tapping the NFC tag will automatically identify the branch and collect your stamp.</span></div>
        <button class="btn block primary" data-action="submitStamp" data-method="NFC">Confirm Branch Tap</button>
        <button class="btn block ghost" style="margin-top:6px" data-action="closeSheet">Cancel</button>
      `;
    }
    case 'loading': {
      return `
        <div style="padding:36px 0 28px;text-align:center">
          <div class="spin"></div>
          <p class="m" style="margin-top:16px">${esc(s.msg || 'Verifying with server…')}</p>
        </div>
      `;
    }
    case 'success': {
      const r = s.result;
      return `
        <div class="mark ok">${icon('check', 36)}</div>
        ${shHeader(r.done ? 'Reward unlocked!' : 'Stamp collected!', r.done ? 'Your card is complete. Show it at the counter for your free coffee.' : '+1 stamp added to your card')}
        <div style="margin:0 0 18px">
          <div class="center t" style="margin-bottom:8px">${r.stamps} of ${r.total} stamps</div>
          <div class="bar l"><i style="width:${(r.stamps / r.total) * 100}%"></i></div>
        </div>
        <button class="btn primary block" data-action="closeSheet">Done</button>
      `;
    }
    case 'error': {
      const err = s.err || {};
      return `
        <div class="mark bad">${icon('x', 36)}</div>
        ${shHeader(esc(err.title || 'Collection failed'), esc(err.msg || 'Unable to collect stamp.'))}
        <button class="btn primary block" data-action="closeSheet">Close</button>
      `;
    }
    case 'info': {
      const inf = s.info || {};
      return `
        <div class="mark warn">${icon(inf.ic || 'info', 36)}</div>
        ${shHeader(esc(inf.title || 'Notice'), esc(inf.msg || ''))}
        <button class="btn primary block" data-action="closeSheet">Got it</button>
      `;
    }
    default:
      return '';
  }
}

function updateSheet() {
  const el = $('#sheet');
  if (!state.sheet) {
    el.classList.remove('show');
    setTimeout(() => {
      el.hidden = true;
      el.innerHTML = '';
    }, 200);
    return;
  }
  el.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Collect stamp">
      <div class="step">${renderSheetBody()}</div>
    </div>
  `;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
}

function openSheet() {
  const k = state.card;
  state.sheet = {
    step: 'choose',
    store: state.activeStore,
    method: 'QR',
    result: null,
    err: null,
    info: null
  };

  // Pre-checks
  if (state.user && state.user.status === 'blocked') {
    state.sheet.step = 'info';
    state.sheet.info = {
      ic: 'ban',
      title: 'Account Restricted',
      msg: 'Your account is currently restricted. Please contact VERS CAFFEE support.'
    };
  } else if (hasCollectedToday()) {
    state.sheet.step = 'info';
    state.sheet.info = {
      ic: 'clock',
      title: 'Daily Limit Reached',
      msg: `You can collect ${DAILY_LIMIT} stamp per day across all branches. Come back tomorrow!`
    };
  } else if (k.stamps >= THRESHOLD) {
    state.sheet.step = 'info';
    state.sheet.info = {
      ic: 'gift',
      title: 'Reward Ready!',
      msg: 'Your card is already full. Please redeem your free coffee before collecting more stamps.'
    };
  }

  updateSheet();
}

function closeSheet() {
  stopCamera();
  state.sheet = null;
  updateSheet();
  renderMainView();
}

// ==========================================
// REAL QR CAMERA SCANNER
// ==========================================

async function loadQrScannerLib() {
  if (window.Html5Qrcode) return window.Html5Qrcode;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    s.onload = () => resolve(window.Html5Qrcode);
    s.onerror = () => reject(new Error('Failed to load camera QR library'));
    document.head.appendChild(s);
  });
}

async function startQrScanner() {
  state.sheet.step = 'qr_scanner';
  updateSheet();

  try {
    const Html5Qrcode = await loadQrScannerLib();
    const qrContainer = document.getElementById('qr-reader');
    if (!qrContainer) return;

    state.html5QrScanner = new Html5Qrcode('qr-reader');
    state.isScanning = true;

    await state.html5QrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decodedText) => {
        if (!state.isScanning) return;
        state.isScanning = false;
        await stopCamera();
        handleScannedPayload(decodedText, 'QR');
      },
      (error) => {
        // Continuous scan frame error, safely ignore
      }
    );
  } catch (err) {
    console.warn('Camera start error:', err);
    state.sheet.step = 'error';
    state.sheet.err = {
      title: 'Camera Access Denied',
      msg: 'Could not access the camera. Please grant camera permission or use the manual branch selector.'
    };
    updateSheet();
  }
}

async function stopCamera() {
  if (state.html5QrScanner) {
    try {
      if (state.html5QrScanner.isScanning) {
        await state.html5QrScanner.stop();
      }
      state.html5QrScanner.clear();
    } catch (e) {
      console.warn('Camera stop note:', e);
    }
    state.html5QrScanner = null;
  }
  state.isScanning = false;
}

// Parses QR or NFC payload (e.g. "https://domain.vercel.app/?store=VERS_CAFFEE_MAIN" or "VERS_CAFFEE_MAIN")
function extractStoreCode(text) {
  if (!text) return DEFAULT_STORE;
  try {
    if (text.startsWith('http://') || text.startsWith('https://')) {
      const url = new URL(text);
      return url.searchParams.get('store') || DEFAULT_STORE;
    }
  } catch (e) {}
  return text.trim();
}

async function handleScannedPayload(payload, method = 'QR') {
  const storeCode = extractStoreCode(payload);
  state.activeStore = storeCode;
  await executeCollectStamp(storeCode, method);
}

// ==========================================
// STAMP COLLECTION EXECUTION
// ==========================================

async function executeCollectStamp(storeCode, method = 'QR') {
  state.sheet = state.sheet || {};
  state.sheet.step = 'loading';
  state.sheet.msg = 'Validating and collecting stamp…';
  updateSheet();

  const res = await collectStamp({ storeCode, method });

  if (res.ok) {
    state.sheet.step = 'success';
    state.sheet.result = {
      stamps: res.stamps,
      total: res.total || THRESHOLD,
      done: res.done
    };
    showToast('+1 stamp collected!', 'ok');
  } else {
    const errorMap = {
      limit: { title: 'Daily Limit Reached', msg: 'You have already collected your stamp for today.' },
      full: { title: 'Card Complete', msg: 'Please redeem your reward before collecting more stamps.' },
      blocked: { title: 'Account Restricted', msg: 'Your account is restricted. Contact support.' },
      store_inactive: { title: 'Branch Inactive', msg: 'This branch is currently marked inactive.' },
      invalid_store: { title: 'Branch Not Found', msg: 'The scanned branch code was not recognized.' }
    };
    state.sheet.step = 'error';
    state.sheet.err = errorMap[res.code] || {
      title: 'Collection Failed',
      msg: res.message || 'Server rejected the stamp request.'
    };
  }
  updateSheet();
}

// ==========================================
// NFC READING SUPPORT
// ==========================================

async function startNfcFlow() {
  if ('NDEFReader' in window) {
    try {
      const ndef = new window.NDEFReader();
      await ndef.scan();
      showToast('NFC Scanner Ready. Tap tag now…');
      ndef.onreading = (event) => {
        let storeCode = DEFAULT_STORE;
        for (const record of event.message.records) {
          if (record.recordType === 'url') {
            const decoder = new TextDecoder();
            const urlStr = decoder.decode(record.data);
            storeCode = extractStoreCode(urlStr);
            break;
          }
        }
        executeCollectStamp(storeCode, 'NFC');
      };
      state.sheet.step = 'nfc_wait';
      updateSheet();
      return;
    } catch (e) {
      console.warn('Direct NDEFReader not available:', e);
    }
  }

  // Fallback to guided NFC step
  state.sheet.step = 'nfc_wait';
  updateSheet();
}

// ==========================================
// EVENT HANDLING
// ==========================================

const ACTIONS = {
  nav(el) {
    state.activeView = el.dataset.view;
    renderMainView();
    window.scrollTo(0, 0);
  },
  openCollectSheet() {
    openSheet();
  },
  closeSheet() {
    closeSheet();
  },
  startQrScanner() {
    startQrScanner();
  },
  stopQrAndClose() {
    closeSheet();
  },
  startNfcRead() {
    startNfcFlow();
  },
  submitStamp(el) {
    const m = el.dataset.method || 'QR';
    executeCollectStamp(state.sheet.store || state.activeStore, m);
  },
  setHistoryFilter(el) {
    state.historyFilter = el.dataset.k;
    renderMainView();
  },
  async redeemReward() {
    const ok = confirm('Redeem your free coffee reward at the counter now?');
    if (!ok) return;

    showToast('Processing reward redemption…');
    const res = await redeemReward();
    if (res.ok) {
      showToast('Reward redeemed! Enjoy your coffee ☕', 'ok');
      renderMainView();
    } else {
      showToast(res.message || 'Redemption failed', 'bad');
    }
  }
};

const CHANGES = {
  darkToggle(el) {
    state.theme = el.checked ? 'dark' : 'light';
    localStorage.setItem('vers_theme', state.theme);
    applyTheme();
  },
  selectSheetStore(el) {
    if (state.sheet) {
      state.sheet.store = el.value;
      state.activeStore = el.value;
    }
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) {
    ACTIONS[el.dataset.action](el, e);
  }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && CHANGES[el.dataset.change]) {
    CHANGES[el.dataset.change](el, e);
  }
});

// ==========================================
// INITIALIZATION
// ==========================================

export async function initApp() {
  applyTheme();

  // 1. Authenticate via Telegram WebApp
  const authResult = await authenticateTelegram();

  if (!authResult.success && !authResult.isDev) {
    // Unsupported environment screen
    $('#app').innerHTML = `
      <div class="phone" style="display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;">
        <div style="max-width:320px;">
          <div style="margin-bottom:16px;">${logo('lg')}</div>
          <h2 style="font-family:var(--display);font-size:20px;margin-bottom:8px;">VERS CAFFEE LOYALTY</h2>
          <p class="m" style="margin-bottom:18px;">
            This loyalty system is designed exclusively as a Telegram Mini App. Please open it inside Telegram to access your loyalty card and collect stamps.
          </p>
          <a class="btn primary block" href="https://t.me/" target="_blank">Open Telegram</a>
          <button class="btn ghost block" style="margin-top:10px;" onclick="window.location.search='?dev=true'">Preview in Dev Mode</button>
        </div>
      </div>
    `;
    return;
  }

  state.user = authResult.user;
  renderMainView();

  // 2. Load active branches
  try {
    state.stores = await getActiveStores();
  } catch (e) {
    console.warn('Could not fetch stores:', e);
  }

  // 3. Real-time Firestore sync
  if (state.user && state.user.telegramId) {
    const userId = state.user.telegramId;

    subscribeToCard(userId, (cardData) => {
      state.card = cardData;
      renderMainView();
    }, (err) => console.warn('Card sync note:', err));

    subscribeToTransactions(userId, (txList) => {
      state.transactions = txList;
      renderMainView();
    }, (err) => console.warn('Tx sync note:', err));
  }

  // 4. Auto-detect NFC or QR incoming parameters from URL
  const urlParams = new URLSearchParams(window.location.search);
  const incomingStore = urlParams.get('store');
  const incomingSource = urlParams.get('source');

  if (incomingStore) {
    state.activeStore = incomingStore;
    setTimeout(() => {
      executeCollectStamp(incomingStore, incomingSource === 'nfc' ? 'NFC' : 'QR');
    }, 600);
  }
}

// Auto-boot on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
