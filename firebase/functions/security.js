'use strict';

/**
 * In-memory sliding window rate limiter for Cloud Functions instances.
 * Backed by Firestore securityEvents for persistent forensics.
 */
const rateLimitMap = new Map();

/**
 * Checks in-memory rate limit for a given key.
 * 
 * @param {string} key - e.g. "user:12345" or "ip:1.2.3.4"
 * @param {number} maxRequests - Max requests allowed in window
 * @param {number} windowMs - Window duration in milliseconds (default: 60000 = 1 min)
 * @returns {boolean} - true if allowed, false if limit exceeded
 */
function checkRateLimit(key, maxRequests = 30, windowMs = 60000) {
  const now = Date.now();
  let record = rateLimitMap.get(key);

  if (!record || now - record.startTime > windowMs) {
    record = { startTime: now, count: 1 };
    rateLimitMap.set(key, record);
    return true;
  }

  record.count += 1;
  if (record.count > maxRequests) {
    return false;
  }
  return true;
}

/**
 * Logs a security event into Firestore securityEvents collection.
 * 
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} params
 */
async function logSecurityEvent(db, {
  telegramUserId = 'unknown',
  storeId = null,
  eventType,
  riskLevel = 'low', // 'low' | 'medium' | 'high'
  description,
  metadata = {}
}) {
  try {
    await db.collection('securityEvents').add({
      telegramUserId: String(telegramUserId),
      storeId: storeId ? String(storeId) : null,
      eventType: String(eventType),
      riskLevel: String(riskLevel),
      description: String(description),
      metadata,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to write security event:', err);
  }
}

/**
 * Returns current date string formatted as YYYY-MM-DD in the specified timezone.
 * Defaults to "Asia/Tashkent" as required for VERS CAFFEE.
 */
function getLocalDateString(timeZone = 'Asia/Tashkent', date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date); // outputs "YYYY-MM-DD"
  } catch (e) {
    // Fallback if timezone not supported
    return date.toISOString().split('T')[0];
  }
}

module.exports = {
  checkRateLimit,
  logSecurityEvent,
  getLocalDateString
};
