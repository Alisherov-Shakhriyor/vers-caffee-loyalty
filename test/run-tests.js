/**
 * VERS CAFFEE LOYALTY — Automated Verification Test Suite
 * Tests Telegram WebApp HMAC verification, daily limit enforcement,
 * rate limiting, card thresholds, and reward redemption logic.
 */

const crypto = require('crypto');
const { verifyTelegramWebAppData } = require('../firebase/functions/telegram');
const { checkRateLimit, getLocalDateString } = require('../firebase/functions/security');
const { THRESHOLD, DAILY_LIMIT } = require('../firebase/functions/stamps');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failedTests++;
  }
}

console.log('====================================================');
console.log('🧪 RUNNING VERS CAFFEE LOYALTY TEST SUITE');
console.log('====================================================\n');

// -----------------------------------------------------------------
// 1. TELEGRAM AUTHENTICATION TESTS
// -----------------------------------------------------------------
console.log('1. Telegram WebApp Cryptographic Authentication:');

const MOCK_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz12345';
const sampleUser = { id: 77889900, first_name: 'Shakhriyor', username: 'shaxriyor_al' };
const authDate = Math.floor(Date.now() / 1000);

// Helper to generate valid initData with HMAC-SHA256
function generateTestInitData(userObj, timestamp, botToken = MOCK_BOT_TOKEN) {
  const params = {
    auth_date: String(timestamp),
    query_id: 'AAHdF60AAAAAAN0XrQC6v1b9',
    user: JSON.stringify(userObj)
  };
  const pairs = Object.entries(params).map(([k, v]) => `${k}=${v}`).sort();
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...params, hash }).toString();
}

// Test 1.1: Valid Telegram authentication
const validInitData = generateTestInitData(sampleUser, authDate);
const res1 = verifyTelegramWebAppData(validInitData, MOCK_BOT_TOKEN);
assert(res1.valid === true && res1.user.id === 77889900, 'Valid Telegram HMAC signature and user ID decoded correctly');

// Test 1.2: Invalid authentication signature (tampered user data)
const tamperedInitData = validInitData.replace('77889900', '99999999');
const res2 = verifyTelegramWebAppData(tamperedInitData, MOCK_BOT_TOKEN);
assert(res2.valid === false, 'Tampered data rejected with signature mismatch');

// Test 1.3: Expired authentication data (> 24 hours old)
const expiredTimestamp = authDate - 90000; // 25 hours ago
const expiredInitData = generateTestInitData(sampleUser, expiredTimestamp);
const res3 = verifyTelegramWebAppData(expiredInitData, MOCK_BOT_TOKEN);
assert(res3.valid === false && res3.error === 'AUTH_DATE_EXPIRED', 'Expired auth_date (>24h) rejected');

// Test 1.4: Missing or invalid bot token
const res4 = verifyTelegramWebAppData(validInitData, '');
assert(res4.valid === false && res4.error === 'MISSING_BOT_TOKEN', 'Missing bot token fails gracefully');

// Test 1.5: Missing initData
const res5 = verifyTelegramWebAppData(null, MOCK_BOT_TOKEN);
assert(res5.valid === false && res5.error === 'MISSING_INIT_DATA', 'Missing initData fails gracefully');

// -----------------------------------------------------------------
// 2. RATE LIMITING & SECURITY TESTS
// -----------------------------------------------------------------
console.log('\n2. Security & Rate Limiting:');

const testKey = 'test_user_' + Date.now();
let rateLimitPassed = true;
// Call 5 times (limit is 5)
for (let i = 0; i < 5; i++) {
  if (!checkRateLimit(testKey, 5, 10000)) rateLimitPassed = false;
}
assert(rateLimitPassed, 'Allows requests within threshold');

// 6th call should be blocked
const blockedCall = checkRateLimit(testKey, 5, 10000);
assert(blockedCall === false, 'Blocks requests exceeding threshold');

// -----------------------------------------------------------------
// 3. BUSINESS LOGIC & TIMEZONE CALCULATIONS
// -----------------------------------------------------------------
console.log('\n3. Business Rules & Daily Limit Verification:');

const tashkentDate = getLocalDateString('Asia/Tashkent', new Date());
assert(/^\d{4}-\d{2}-\d{2}$/.test(tashkentDate), `Timezone Asia/Tashkent calculates local date string (${tashkentDate})`);

assert(THRESHOLD === 10, 'Reward threshold is strictly 10 stamps');
assert(DAILY_LIMIT === 1, 'Daily limit is strictly 1 stamp per day across branches');

// -----------------------------------------------------------------
// 4. MOCK DATABASE & ATOMIC STAMP CARD LOGIC SIMULATION
// -----------------------------------------------------------------
console.log('\n4. Atomic Loyalty Card & Claim Logic Simulation:');

// Simulate state machine
const mockDb = {
  users: {
    '77889900': { telegramId: '77889900', status: 'active' },
    '99999999': { telegramId: '99999999', status: 'blocked' }
  },
  stores: {
    'VERS_CAFFEE_MAIN': { publicCode: 'VERS_CAFFEE_MAIN', status: 'active' },
    'INACTIVE_BRANCH': { publicCode: 'INACTIVE_BRANCH', status: 'inactive' }
  },
  cards: {
    '77889900': { stamps: 0, totalStampsEarned: 0, rewardsEarned: 0, rewardsRedeemed: 0 }
  },
  claims: {},
  transactions: []
};

function simulateCollect(userId, storeCode, idempotencyKey = null) {
  const user = mockDb.users[userId];
  if (!user || user.status === 'blocked') return { ok: false, code: 'blocked' };

  const store = mockDb.stores[storeCode];
  if (!store || store.status !== 'active') return { ok: false, code: 'store_inactive' };

  const localDate = tashkentDate;
  const claimId = `claim_${userId}_${localDate}`;

  if (mockDb.claims[claimId]) {
    return { ok: false, code: 'limit' };
  }

  const card = mockDb.cards[userId];
  if (card.stamps >= THRESHOLD) {
    return { ok: false, code: 'full' };
  }

  // Atomic write
  mockDb.claims[claimId] = true;
  card.stamps += 1;
  card.totalStampsEarned += 1;
  const isDone = card.stamps >= THRESHOLD;
  if (isDone) card.rewardsEarned += 1;

  mockDb.transactions.push({
    userId,
    storeCode,
    status: 'success',
    idempotencyKey
  });

  return { ok: true, stamps: card.stamps, total: THRESHOLD, done: isDone };
}

// Test 4.1: Normal stamp collection
const col1 = simulateCollect('77889900', 'VERS_CAFFEE_MAIN');
assert(col1.ok === true && col1.stamps === 1, 'First stamp collected successfully');

// Test 4.2: Duplicate stamp collection same calendar day
const col2 = simulateCollect('77889900', 'VERS_CAFFEE_MAIN');
assert(col2.ok === false && col2.code === 'limit', 'Second stamp same day rejected with daily limit');

// Test 4.3: Blocked user
const colBlocked = simulateCollect('99999999', 'VERS_CAFFEE_MAIN');
assert(colBlocked.ok === false && colBlocked.code === 'blocked', 'Blocked user rejected');

// Test 4.4: Inactive store
delete mockDb.claims[`claim_77889900_${tashkentDate}`]; // clear claim for test
const colInactive = simulateCollect('77889900', 'INACTIVE_BRANCH');
assert(colInactive.ok === false && colInactive.code === 'store_inactive', 'Inactive branch rejected');

// Test 4.5: 10th stamp unlocks reward and prevents 11th stamp
mockDb.cards['77889900'].stamps = 9;
const col10 = simulateCollect('77889900', 'VERS_CAFFEE_MAIN');
assert(col10.ok === true && col10.stamps === 10 && col10.done === true, '10th stamp completes card & unlocks reward');

delete mockDb.claims[`claim_77889900_${tashkentDate}`];
const col11 = simulateCollect('77889900', 'VERS_CAFFEE_MAIN');
assert(col11.ok === false && col11.code === 'full', 'Full card prevents additional stamps before redemption');

// Test 4.6: Reward redemption resets stamp count
function simulateRedeem(userId) {
  const card = mockDb.cards[userId];
  if (card.stamps < THRESHOLD) return { ok: false, code: 'NO_REWARD' };
  card.stamps -= THRESHOLD;
  card.rewardsRedeemed += 1;
  return { ok: true, stamps: card.stamps, redeemed: card.rewardsRedeemed };
}
const redeemRes = simulateRedeem('77889900');
assert(redeemRes.ok === true && redeemRes.stamps === 0 && redeemRes.redeemed === 1, 'Reward redeemed successfully, stamps reset to 0');

const redeemTwice = simulateRedeem('77889900');
assert(redeemTwice.ok === false, 'Cannot redeem reward twice without collecting 10 stamps again');

// -----------------------------------------------------------------
// 5. SECURITY AUDIT: CHECK FOR LEAKED CREDENTIALS
// -----------------------------------------------------------------
console.log('\n5. Source Code Hygiene & Secrets Audit:');

const fs = require('fs');
const path = require('path');

function scanFileForSecrets(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const forbiddenPatterns = [
    /-----BEGIN PRIVATE KEY-----/,
    /service_account/,
    /sk_live_[0-9a-zA-Z]+/
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) return true;
  }
  return false;
}

const frontendFiles = [
  path.join(__dirname, '../index.html'),
  path.join(__dirname, '../js/app.js'),
  path.join(__dirname, '../js/firebase.js'),
  path.join(__dirname, '../js/config.js'),
  path.join(__dirname, '../js/telegram-auth.js'),
  path.join(__dirname, '../js/api.js'),
  path.join(__dirname, '../js/ui.js')
];

let leakDetected = false;
for (const file of frontendFiles) {
  if (scanFileForSecrets(file)) {
    leakDetected = true;
    console.error(`Leaked secret detected in ${file}`);
  }
}
assert(!leakDetected, 'No private keys or service account credentials in frontend bundles');

// Summary
console.log('\n====================================================');
console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
