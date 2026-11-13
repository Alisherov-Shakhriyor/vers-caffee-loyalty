/**
 * VERS CAFFEE LOYALTY — Firebase Web SDK Module
 * Initializes modular Firebase v10 Auth and Cloud Firestore.
 */

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { 
  getAuth, 
  signInWithCustomToken, 
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { FIREBASE_CONFIG } from './config.js';

let app = null;
let auth = null;
let db = null;

export function initFirebase() {
  if (!getApps().length) {
    app = initializeApp(FIREBASE_CONFIG);
  } else {
    app = getApp();
  }
  auth = getAuth(app);
  db = getFirestore(app);
  return { app, auth, db };
}

export function getDb() {
  if (!db) initFirebase();
  return db;
}

export function getAuthInstance() {
  if (!auth) initFirebase();
  return auth;
}

/**
 * Signs in user with custom token minted by backend Telegram auth
 */
export async function signInWithToken(customToken) {
  const a = getAuthInstance();
  return await signInWithCustomToken(a, customToken);
}

/**
 * Returns a promise that resolves with the current authenticated user ID token
 */
export async function getIdToken() {
  const a = getAuthInstance();
  const user = a.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

/**
 * Subscribes to real-time updates for a customer's loyalty card
 */
export function subscribeToCard(userId, onUpdate, onError) {
  const firestore = getDb();
  const cardRef = doc(firestore, 'loyaltyCards', String(userId));
  return onSnapshot(cardRef, (snap) => {
    if (snap.exists()) {
      onUpdate(snap.data());
    } else {
      onUpdate({ stamps: 0, totalStampsEarned: 0, rewardsEarned: 0, rewardsRedeemed: 0 });
    }
  }, onError);
}

/**
 * Subscribes to real-time updates for customer's stamp transactions
 */
export function subscribeToTransactions(userId, onUpdate, onError) {
  const firestore = getDb();
  const txQuery = query(
    collection(firestore, 'stampTransactions'),
    where('telegramUserId', '==', String(userId)),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(txQuery, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    onUpdate(list);
  }, onError);
}

/**
 * Fetches user profile from Firestore
 */
export async function fetchUserProfile(userId) {
  const firestore = getDb();
  const userRef = doc(firestore, 'users', String(userId));
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
}

/**
 * Fetches active stores
 */
export async function fetchStores() {
  const firestore = getDb();
  const q = query(collection(firestore, 'stores'), where('status', '==', 'active'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
