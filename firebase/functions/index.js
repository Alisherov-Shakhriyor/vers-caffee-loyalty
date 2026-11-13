'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const { verifyTelegramWebAppData } = require('./telegram');
const { checkRateLimit, logSecurityEvent } = require('./security');
const { processStampCollection, processRewardRedemption } = require('./stamps');

// Initialize Firebase Admin once
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const auth = admin.auth();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

/**
 * Endpoint 1: Telegram WebApp Authentication
 * Accepts raw initData, validates HMAC signature, creates/updates user profile,
 * and mints a Firebase custom auth token.
 */
exports.authTelegram = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { initData } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    if (!checkRateLimit(`auth:${ip}`, 20, 60000)) {
      return res.status(429).json({ error: 'Too many authentication attempts. Please try again later.' });
    }

    if (!initData) {
      return res.status(400).json({ error: 'Missing initData parameter.' });
    }

    // Verify cryptographic signature
    const verification = verifyTelegramWebAppData(initData, BOT_TOKEN);
    if (!verification.valid) {
      await logSecurityEvent(db, {
        telegramUserId: 'unauthenticated',
        eventType: 'TELEGRAM_AUTH_FAILED',
        riskLevel: 'high',
        description: `Failed Telegram WebApp auth verification: ${verification.error}`,
        metadata: { ip, error: verification.error }
      });
      return res.status(401).json({ error: 'Invalid Telegram WebApp authentication signature.', code: verification.error });
    }

    const tgUser = verification.user;
    const telegramId = String(tgUser.id);
    const nowIso = new Date().toISOString();

    try {
      // Create or update Firebase Auth user
      const userRef = db.collection('users').doc(telegramId);
      const userSnap = await userRef.get();

      const userProfile = {
        telegramId,
        username: tgUser.username || '',
        firstName: tgUser.first_name || '',
        lastName: tgUser.last_name || '',
        photoUrl: tgUser.photo_url || '',
        status: userSnap.exists ? (userSnap.data().status || 'active') : 'active',
        lastLoginAt: nowIso
      };

      if (!userSnap.exists) {
        userProfile.createdAt = nowIso;
        await userRef.set(userProfile);

        // Initialize customer's loyalty card
        await db.collection('loyaltyCards').doc(telegramId).set({
          telegramUserId: telegramId,
          stamps: 0,
          totalStampsEarned: 0,
          rewardsEarned: 0,
          rewardsRedeemed: 0,
          status: 'active',
          createdAt: nowIso,
          updatedAt: nowIso
        });
      } else {
        await userRef.update({
          username: userProfile.username,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          photoUrl: userProfile.photoUrl,
          lastLoginAt: nowIso
        });
      }

      // Check if user is blocked
      if (userProfile.status === 'blocked') {
        return res.status(403).json({ error: 'User account is restricted.', code: 'blocked' });
      }

      // Mint custom token with telegramId as UID
      const customToken = await auth.createCustomToken(telegramId, {
        telegramId,
        username: tgUser.username || ''
      });

      return res.status(200).json({
        ok: true,
        customToken,
        user: userProfile
      });
    } catch (err) {
      console.error('Error during Telegram auth processing:', err);
      return res.status(500).json({ error: 'Authentication internal server error.' });
    }
  });
});

/**
 * Helper to authenticate incoming Bearer token from Firebase Auth
 */
async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decoded = await auth.verifyIdToken(idToken);
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Endpoint 2: Collect Stamp
 * Atomic, anti-replay, daily-limited stamp collection.
 */
exports.collectStamp = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const decodedToken = await getAuthenticatedUser(req);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Unauthorized. Valid Firebase ID token required.' });
    }

    const telegramUserId = decodedToken.uid;
    const { storeCode, method = 'QR', idempotencyKey } = req.body || {};

    if (!storeCode) {
      return res.status(400).json({ error: 'Missing storeCode parameter.' });
    }

    if (!checkRateLimit(`stamp:${telegramUserId}`, 10, 60000)) {
      await logSecurityEvent(db, {
        telegramUserId,
        eventType: 'RATE_LIMIT_EXCEEDED',
        riskLevel: 'high',
        description: 'Exceeded 10 stamp requests in 60 seconds'
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
  });
});

/**
 * Endpoint 3: Redeem Reward
 * Burns 10 stamps and marks reward as redeemed.
 */
exports.redeemReward = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const decodedToken = await getAuthenticatedUser(req);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const result = await processRewardRedemption(db, decodedToken.uid);
    return res.status(result.ok ? 200 : 400).json(result);
  });
});

/**
 * Endpoint 4: Get Store Info (Public)
 */
exports.getStoreInfo = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    const code = req.query.code || req.body.code;
    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }

    const snap = await db.collection('stores').where('publicCode', '==', String(code)).limit(1).get();
    if (snap.empty) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const store = snap.docs[0].data();
    return res.status(200).json({
      id: snap.docs[0].id,
      name: store.name,
      short: store.short,
      address: store.address,
      hours: store.hours,
      status: store.status,
      publicCode: store.publicCode
    });
  });
});
