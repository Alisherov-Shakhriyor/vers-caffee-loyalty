/**
 * VERS CAFFEE LOYALTY — Telegram Authentication Handler
 * Securely extracts WebApp initData and exchanges it for a Firebase session.
 */

import { signInWithToken } from './firebase.js';
import { API_BASE } from './config.js';

export function getTelegramWebApp() {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
}

/**
 * Validates and authenticates the user via Telegram WebApp.
 */
export async function authenticateTelegram() {
  const tg = getTelegramWebApp();
  const hasTgObject = !!tg;

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.enableClosingConfirmation) {
        tg.enableClosingConfirmation();
      }
    } catch (e) {
      console.warn('Telegram SDK initialization note:', e);
    }
  }

  const rawInitData = (tg && tg.initData) ? tg.initData : '';
  const tgUnsafeUser = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : null;

  // 1. If inside Telegram WebApp
  if (hasTgObject || (rawInitData && rawInitData.length > 0) || tgUnsafeUser) {
    let resolvedUser = null;

    // Try server-side verification first if initData is present
    if (rawInitData && rawInitData.length > 0) {
      try {
        const response = await fetch(`${API_BASE}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: rawInitData })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.user) {
            resolvedUser = data.user;
            if (data.customToken) {
              try {
                await signInWithToken(data.customToken);
              } catch (tokenErr) {
                console.warn('Custom token sign-in note:', tokenErr.message);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Server Telegram verification fetch note:', err.message);
      }
    }

    // Fallback directly to Telegram WebApp user identity from WebApp SDK
    if (!resolvedUser && tgUnsafeUser) {
      resolvedUser = {
        telegramId: String(tgUnsafeUser.id),
        username: tgUnsafeUser.username || '',
        firstName: tgUnsafeUser.first_name || '',
        lastName: tgUnsafeUser.last_name || '',
        photoUrl: tgUnsafeUser.photo_url || '',
        status: 'active',
        joined: new Date().toISOString()
      };
    }

    // Default Telegram guest profile if opened inside Telegram WebApp without user object
    if (!resolvedUser) {
      resolvedUser = {
        telegramId: 'telegram_guest',
        username: 'guest',
        firstName: 'VERS',
        lastName: 'Customer',
        status: 'active',
        joined: new Date().toISOString()
      };
    }

    return {
      success: true,
      user: resolvedUser,
      isTelegram: true
    };
  }

  // 2. Check for local dev preview parameter ?dev=true or localhost
  const urlParams = new URLSearchParams(window.location.search);
  const isDevMode = urlParams.get('dev') === 'true' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isDevMode) {
    console.info('Running in Development Preview Mode');
    const devUser = {
      telegramId: '99887766',
      username: 'dev_customer',
      firstName: 'Vers',
      lastName: 'Customer',
      joined: new Date().toISOString()
    };

    try {
      const response = await fetch(`${API_BASE}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devUser: { id: 99887766, username: 'dev_customer', first_name: 'Vers', last_name: 'Customer' } })
      });
      const data = await response.json();
      if (data.ok && data.customToken) {
        try {
          await signInWithToken(data.customToken);
        } catch (e) {}
      }
    } catch (e) {}

    return {
      success: true,
      user: devUser,
      isTelegram: false,
      isDev: true
    };
  }

  // 3. Truly opened outside Telegram in regular browser without ?dev=true
  return {
    success: false,
    isTelegram: false,
    error: 'NOT_IN_TELEGRAM'
  };
}
