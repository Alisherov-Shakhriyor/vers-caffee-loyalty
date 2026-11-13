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

  const rawInitData = tg ? tg.initData : '';

  // Check if opened inside Telegram with valid initData
  if (rawInitData && rawInitData.length > 0) {
    try {
      const response = await fetch(`${API_BASE}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: rawInitData })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Telegram authentication failed on server');
      }

      // Sign in to Firebase with the verified custom token
      await signInWithToken(data.customToken);

      return {
        success: true,
        user: data.user,
        isTelegram: true
      };
    } catch (err) {
      console.error('Server-side Telegram verification error:', err);
      return {
        success: false,
        error: err.message,
        isTelegram: true
      };
    }
  }

  // Check for local dev preview parameter ?dev=true
  const urlParams = new URLSearchParams(window.location.search);
  const isDevMode = urlParams.get('dev') === 'true' || window.location.hostname === 'localhost';

  if (isDevMode) {
    console.info('Running in Development Preview Mode');
    // Generate a consistent dev test user
    const devUser = {
      id: 99887766,
      username: 'dev_customer',
      first_name: 'Vers',
      last_name: 'Customer',
      photo_url: ''
    };

    try {
      const response = await fetch(`${API_BASE}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devUser })
      });
      const data = await response.json();
      if (data.ok && data.customToken) {
        await signInWithToken(data.customToken);
        return { success: true, user: data.user, isTelegram: false, isDev: true };
      }
    } catch (e) {
      console.warn('Dev auth fallback:', e);
    }

    return {
      success: true,
      user: {
        telegramId: '99887766',
        username: 'dev_customer',
        firstName: 'Vers',
        lastName: 'Customer',
        joined: new Date().toISOString()
      },
      isTelegram: false,
      isDev: true
    };
  }

  // Not in Telegram and not in dev preview
  return {
    success: false,
    isTelegram: false,
    error: 'NOT_IN_TELEGRAM'
  };
}
