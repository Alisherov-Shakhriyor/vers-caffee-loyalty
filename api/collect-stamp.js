'use strict';

const { db, auth } = require('./_lib/firebase-admin');
const { processStampCollection, checkRateLimit, logSecurityEvent } = require('./_lib/logic');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Verify Bearer token
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Firebase ID token required.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }

  const telegramUserId = decodedToken.uid;
  const { storeCode, method = 'QR', idempotencyKey } = req.body || {};

  if (!storeCode) {
    return res.status(400).json({ error: 'Missing storeCode' });
  }

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
};
