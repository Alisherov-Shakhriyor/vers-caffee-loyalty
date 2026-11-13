'use strict';

const crypto = require('crypto');

/**
 * Validates Telegram WebApp initData string against the bot token.
 * 
 * @param {string} rawInitData - URL-encoded or raw initData string from Telegram.WebApp.initData
 * @param {string} botToken - Telegram Bot Token issued by @BotFather
 * @param {number} maxAgeSeconds - Max allowed age of auth_date (default: 86400 = 24h)
 * @returns {{ valid: boolean, user?: object, authDate?: number, error?: string }}
 */
function verifyTelegramWebAppData(rawInitData, botToken, maxAgeSeconds = 86400) {
  if (!rawInitData || typeof rawInitData !== 'string') {
    return { valid: false, error: 'MISSING_INIT_DATA' };
  }
  if (!botToken || typeof botToken !== 'string' || botToken.trim() === '') {
    return { valid: false, error: 'MISSING_BOT_TOKEN' };
  }

  try {
    const params = new URLSearchParams(rawInitData);
    const hash = params.get('hash');

    if (!hash) {
      return { valid: false, error: 'MISSING_HASH' };
    }

    const authDateStr = params.get('auth_date');
    if (!authDateStr) {
      return { valid: false, error: 'MISSING_AUTH_DATE' };
    }

    const authDate = parseInt(authDateStr, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Validate expiration
    if (isNaN(authDate) || nowSeconds - authDate > maxAgeSeconds) {
      return { valid: false, error: 'AUTH_DATE_EXPIRED' };
    }

    // Reject clock skew too far in the future (> 5 mins)
    if (authDate - nowSeconds > 300) {
      return { valid: false, error: 'AUTH_DATE_FUTURE' };
    }

    // Build data-check-string (sort keys, exclude 'hash')
    const pairs = [];
    for (const [key, value] of params.entries()) {
      if (key !== 'hash') {
        pairs.push(`${key}=${value}`);
      }
    }
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    // Secret key = HMAC-SHA-256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Calculated hash = HMAC-SHA-256(secretKey, dataCheckString)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const hashBuffer = Buffer.from(hash, 'hex');
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

    if (hashBuffer.length !== calculatedBuffer.length || !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
      return { valid: false, error: 'SIGNATURE_MISMATCH' };
    }

    // Parse user object
    const userJson = params.get('user');
    let user = null;
    if (userJson) {
      try {
        user = JSON.parse(userJson);
      } catch (e) {
        return { valid: false, error: 'INVALID_USER_JSON' };
      }
    }

    if (!user || !user.id) {
      return { valid: false, error: 'MISSING_USER_ID' };
    }

    return {
      valid: true,
      user,
      authDate,
      queryId: params.get('query_id') || null,
      startParam: params.get('start_param') || null
    };
  } catch (err) {
    return { valid: false, error: err.message || 'VERIFICATION_EXCEPTION' };
  }
}

module.exports = {
  verifyTelegramWebAppData
};
