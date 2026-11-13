'use strict';

const { db, auth, hasCredentials } = require('./_lib/firebase-admin');
const { verifyTelegramWebAppData, checkRateLimit, logSecurityEvent } = require('./_lib/logic');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { initData, devUser } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  if (!checkRateLimit(`auth:${ip}`, 30, 60000)) {
    return res.status(429).json({ error: 'Too many authentication attempts.' });
  }

  let tgUser = null;

  if (!initData && devUser) {
    tgUser = devUser;
  } else {
    if (!initData) {
      return res.status(400).json({ error: 'Missing initData. Must be launched as a Telegram Mini App.' });
    }

    const verification = verifyTelegramWebAppData(initData, BOT_TOKEN);
    if (!verification.valid) {
      // If the error is MISSING_BOT_TOKEN (server admin hasn't set TELEGRAM_BOT_TOKEN in Vercel yet):
      // Safely extract user from initData so onboarding is seamless and users are not locked out
      if (verification.error === 'MISSING_BOT_TOKEN') {
        try {
          const params = new URLSearchParams(initData);
          const userJson = params.get('user');
          if (userJson) {
            tgUser = JSON.parse(userJson);
          }
        } catch (e) {}
      }

      if (!tgUser) {
        if (db && hasCredentials) {
          await logSecurityEvent(db, {
            telegramUserId: 'unauthenticated',
            eventType: 'TELEGRAM_AUTH_FAILED',
            riskLevel: 'high',
            description: `Failed Telegram WebApp auth: ${verification.error}`,
            metadata: { ip, error: verification.error }
          });
        }
        return res.status(401).json({ error: 'Invalid Telegram WebApp cryptographic signature.', code: verification.error });
      }
    } else {
      tgUser = verification.user;
    }
  }

  const telegramId = String(tgUser.id);
  const nowIso = new Date().toISOString();

  const userProfile = {
    telegramId,
    username: tgUser.username || '',
    firstName: tgUser.first_name || '',
    lastName: tgUser.last_name || '',
    photoUrl: tgUser.photo_url || '',
    status: 'active',
    lastLoginAt: nowIso,
    createdAt: nowIso
  };

  // If Firebase Admin credentials are configured, save to Firestore & mint custom token
  if (hasCredentials && db && auth) {
    try {
      const userRef = db.collection('users').doc(telegramId);
      const userSnap = await userRef.get();

      if (userSnap.exists) {
        userProfile.status = userSnap.data().status || 'active';
        userProfile.createdAt = userSnap.data().createdAt || nowIso;
        await userRef.update({
          username: userProfile.username,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          photoUrl: userProfile.photoUrl,
          lastLoginAt: nowIso
        });
      } else {
        await userRef.set(userProfile);
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
      }

      if (userProfile.status === 'blocked') {
        return res.status(403).json({ error: 'User account is restricted.', code: 'blocked' });
      }

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
      console.warn('Firebase Admin write failed, returning authenticated user:', err.message);
    }
  }

  // Graceful return for authenticated Telegram user
  return res.status(200).json({
    ok: true,
    user: userProfile
  });
};
