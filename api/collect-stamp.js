'use strict';

const { db, auth, hasCredentials } = require('./_lib/firebase-admin');
const { processStampCollection, checkRateLimit, logSecurityEvent, THRESHOLD } = require('./_lib/logic');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { storeCode, method = 'QR', idempotencyKey, fallbackUserId } = req.body || {};

  if (!storeCode) {
    return res.status(400).json({ error: 'Missing storeCode' });
  }

  let telegramUserId = fallbackUserId || 'guest';

  // Check Bearer token if provided
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ') && hasCredentials && auth) {
    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decoded = await auth.verifyIdToken(idToken);
      telegramUserId = decoded.uid;
    } catch (e) {
      console.warn('ID token verify note:', e.message);
    }
  }

  if (hasCredentials && db) {
    if (!checkRateLimit(`stamp:${telegramUserId}`, 10, 60000)) {
      await logSecurityEvent(db, {
        telegramUserId,
        eventType: 'RATE_LIMIT_EXCEEDED',
        riskLevel: 'high',
        description: 'More than 10 stamp attempts in 60s'
      });
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute.' });
    }

    const result = await processStampCollection(db, {
      telegramUserId,
      storeCode: String(storeCode).trim(),
      method,
      idempotencyKey
    });

    return res.status(result.ok ? 200 : 400).json(result);
  }

  // Fallback response when backend credentials pending setup
  return res.status(200).json({
    ok: true,
    stamps: 1,
    total: THRESHOLD,
    done: false,
    storeName: 'VERS CAFFEE',
    note: 'collected'
  });
};
