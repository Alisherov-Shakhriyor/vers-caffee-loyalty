'use strict';

const { getLocalDateString, logSecurityEvent } = require('./security');

const THRESHOLD = 10;
const DAILY_LIMIT = 1;

/**
 * Executes atomic stamp collection within a Firestore transaction.
 * 
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} params
 */
async function processStampCollection(db, {
  telegramUserId,
  storeCode,
  method = 'QR',
  idempotencyKey = null
}) {
  const userId = String(telegramUserId);
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Resolve store by publicCode (e.g. VC-CHL, VC-YUN, VC-MIR, VERS_CAFFEE_MAIN)
  const storesSnapshot = await db
    .collection('stores')
    .where('publicCode', '==', storeCode)
    .limit(1)
    .get();

  let storeDoc;
  let storeId;
  let storeData;

  if (storesSnapshot.empty) {
    // Try fallback lookup by document ID directly
    const directDoc = await db.collection('stores').doc(storeCode).get();
    if (!directDoc.exists) {
      await logSecurityEvent(db, {
        telegramUserId: userId,
        storeId: storeCode,
        eventType: 'INVALID_STORE_CODE',
        riskLevel: 'medium',
        description: `Scan attempt with invalid store identifier: ${storeCode}`
      });
      return { ok: false, code: 'invalid_store', message: 'Store not recognized.' };
    }
    storeDoc = directDoc;
    storeId = directDoc.id;
    storeData = directDoc.data();
  } else {
    storeDoc = storesSnapshot.docs[0];
    storeId = storeDoc.id;
    storeData = storeDoc.data();
  }

  // Verify store status
  if (storeData.status !== 'active') {
    return { ok: false, code: 'store_inactive', message: 'This branch is currently inactive.' };
  }

  const storeTz = storeData.timezone || 'Asia/Tashkent';
  const localDate = getLocalDateString(storeTz, now);
  // Deterministic daily claim ID enforcing 1 stamp per day across all branches
  const claimDocId = `claim_${userId}_${localDate}`;

  const userRef = db.collection('users').doc(userId);
  const cardRef = db.collection('loyaltyCards').doc(userId);
  const claimRef = db.collection('dailyStampClaims').doc(claimDocId);

  // Check idempotency if key provided
  if (idempotencyKey) {
    const existingTx = await db
      .collection('stampTransactions')
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(1)
      .get();

    if (!existingTx.empty) {
      const txData = existingTx.docs[0].data();
      const currentCard = await cardRef.get();
      const cardData = currentCard.exists ? currentCard.data() : { stamps: 0 };
      return {
        ok: txData.status === 'success',
        code: txData.status === 'success' ? 'idempotent_ok' : txData.status,
        stamps: cardData.stamps,
        total: THRESHOLD,
        done: cardData.stamps >= THRESHOLD,
        duplicate: true
      };
    }
  }

  // Run atomic Firestore transaction
  try {
    const result = await db.runTransaction(async (transaction) => {
      // 1. Read User
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) {
        throw new Error('USER_NOT_FOUND');
      }
      const userData = userSnapshot.data();
      if (userData.status === 'blocked') {
        throw new Error('USER_BLOCKED');
      }

      // 2. Read Loyalty Card
      const cardSnapshot = await transaction.get(cardRef);
      let cardData = cardSnapshot.exists
        ? cardSnapshot.data()
        : {
            telegramUserId: userId,
            stamps: 0,
            totalStampsEarned: 0,
            rewardsEarned: 0,
            rewardsRedeemed: 0,
            createdAt: nowIso,
            updatedAt: nowIso,
            status: 'active'
          };

      // 3. Read Daily Claim
      const claimSnapshot = await transaction.get(claimRef);
      if (claimSnapshot.exists) {
        throw new Error('DAILY_LIMIT_REACHED');
      }

      // 4. Check if card is full
      if (cardData.stamps >= THRESHOLD) {
        throw new Error('CARD_IS_FULL');
      }

      // 5. Calculate new stamps
      const newStamps = cardData.stamps + 1;
      const newTotalStamps = (cardData.totalStampsEarned || cardData.stamps) + 1;
      const isCardComplete = newStamps >= THRESHOLD;
      const newRewardsEarned = isCardComplete
        ? (cardData.rewardsEarned || 0) + 1
        : (cardData.rewardsEarned || 0);

      // 6. Write daily claim atomically
      transaction.set(claimRef, {
        telegramUserId: userId,
        storeId,
        localDate,
        createdAt: nowIso
      });

      // 7. Update Loyalty Card atomically
      transaction.set(
        cardRef,
        {
          telegramUserId: userId,
          stamps: newStamps,
          totalStampsEarned: newTotalStamps,
          rewardsEarned: newRewardsEarned,
          rewardsRedeemed: cardData.rewardsRedeemed || 0,
          updatedAt: nowIso,
          lastStampAt: nowIso,
          status: 'active'
        },
        { merge: true }
      );

      // 8. Create Transaction Record atomically
      const txRef = db.collection('stampTransactions').doc();
      transaction.set(txRef, {
        telegramUserId: userId,
        storeId,
        storeName: storeData.name || 'VERS CAFFEE',
        storeShort: storeData.short || 'Branch',
        method: method === 'NFC' ? 'NFC' : 'QR',
        status: 'success',
        createdAt: nowIso,
        localDate,
        idempotencyKey: idempotencyKey || txRef.id
      });

      return {
        ok: true,
        stamps: newStamps,
        total: THRESHOLD,
        done: isCardComplete,
        storeName: storeData.name || 'VERS CAFFEE',
        txId: txRef.id
      };
    });

    return result;
  } catch (err) {
    const errorMsg = err.message || '';
    let code = 'error';
    let status = 'rejected';

    if (errorMsg === 'USER_BLOCKED') {
      code = 'blocked';
      status = 'blocked';
    } else if (errorMsg === 'DAILY_LIMIT_REACHED') {
      code = 'limit';
      status = 'duplicate';
      await logSecurityEvent(db, {
        telegramUserId: userId,
        storeId,
        eventType: 'DUPLICATE_STAMP_ATTEMPT',
        riskLevel: 'medium',
        description: `Customer attempted second stamp on ${localDate} (daily limit enforced)`
      });
    } else if (errorMsg === 'CARD_IS_FULL') {
      code = 'full';
      status = 'invalid';
    } else if (errorMsg === 'USER_NOT_FOUND') {
      code = 'user_not_found';
    }

    // Record rejected attempt in stampTransactions for transparency in history
    try {
      await db.collection('stampTransactions').add({
        telegramUserId: userId,
        storeId,
        storeName: storeData.name || 'VERS CAFFEE',
        storeShort: storeData.short || 'Branch',
        method: method === 'NFC' ? 'NFC' : 'QR',
        status,
        createdAt: nowIso,
        localDate,
        idempotencyKey: idempotencyKey || null,
        rejectionReason: code
      });
    } catch (logErr) {
      console.error('Failed to log failed stamp transaction:', logErr);
    }

    return { ok: false, code };
  }
}

/**
 * Redeems an unlocked reward atomically.
 * 
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} telegramUserId
 */
async function processRewardRedemption(db, telegramUserId) {
  const userId = String(telegramUserId);
  const now = new Date();
  const nowIso = now.toISOString();
  const cardRef = db.collection('loyaltyCards').doc(userId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const cardSnapshot = await transaction.get(cardRef);
      if (!cardSnapshot.exists) {
        throw new Error('CARD_NOT_FOUND');
      }

      const card = cardSnapshot.data();
      const currentStamps = card.stamps || 0;
      const rewardsEarned = card.rewardsEarned || 0;
      const rewardsRedeemed = card.rewardsRedeemed || 0;

      // Card must have 10 stamps or an unredeemed reward
      if (currentStamps < THRESHOLD && rewardsEarned <= rewardsRedeemed) {
        throw new Error('NO_REWARD_AVAILABLE');
      }

      const newRedeemed = rewardsRedeemed + 1;
      // Reset stamps for next cycle
      const newStamps = Math.max(0, currentStamps - THRESHOLD);

      transaction.update(cardRef, {
        stamps: newStamps,
        rewardsRedeemed: newRedeemed,
        updatedAt: nowIso,
        lastRedeemedAt: nowIso
      });

      // Log redemption transaction
      const txRef = db.collection('stampTransactions').doc();
      transaction.set(txRef, {
        telegramUserId: userId,
        storeId: 'REWARD_COUNTER',
        storeName: 'VERS CAFFEE Reward',
        storeShort: 'Reward',
        method: 'REDEEM',
        status: 'redeemed',
        createdAt: nowIso,
        rewardTitle: 'Free Coffee'
      });

      return {
        ok: true,
        stamps: newStamps,
        total: THRESHOLD,
        rewardsRedeemed: newRedeemed
      };
    });

    return result;
  } catch (err) {
    return { ok: false, code: err.message || 'REDEMPTION_FAILED' };
  }
}

module.exports = {
  processStampCollection,
  processRewardRedemption,
  THRESHOLD,
  DAILY_LIMIT
};
