/**
 * VERS CAFFEE LOYALTY — API Service Layer
 * Replaces mock localStorage with real authenticated backend operations.
 */

import { getIdToken, fetchUserProfile, fetchStores } from './firebase.js';
import { API_BASE } from './config.js';

/**
 * Calls backend to collect a stamp atomically.
 * 
 * @param {object} params
 * @param {string} params.storeCode - Store public code e.g. "VERS_CAFFEE_MAIN"
 * @param {string} params.method - "QR" | "NFC"
 * @param {string} [params.idempotencyKey]
 */
export async function collectStamp({ storeCode, method = 'QR', idempotencyKey = null }) {
  const token = await getIdToken();
  const key = idempotencyKey || ('idem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));

  const response = await fetch(`${API_BASE}/api/collect-stamp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      storeCode,
      method,
      idempotencyKey: key
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      ok: false,
      code: data.code || 'error',
      message: data.error || 'Failed to collect stamp'
    };
  }

  return data;
}

/**
 * Redeems 10 stamps for a reward via secure backend function.
 */
export async function redeemReward() {
  const token = await getIdToken();

  const response = await fetch(`${API_BASE}/api/redeem-reward`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      ok: false,
      code: data.code || 'error',
      message: data.error || 'Failed to redeem reward'
    };
  }

  return data;
}

/**
 * Resolves store details by code
 */
export async function getStoreByPublicId(storeCode) {
  try {
    const response = await fetch(`${API_BASE}/api/store?code=${encodeURIComponent(storeCode)}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('Failed to resolve store:', e);
    return null;
  }
}

/**
 * Retrieves all active stores
 */
export async function getActiveStores() {
  try {
    return await fetchStores();
  } catch (e) {
    const res = await fetch(`${API_BASE}/api/store`);
    if (res.ok) return await res.json();
    return [];
  }
}

export { fetchUserProfile };
