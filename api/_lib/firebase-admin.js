'use strict';

const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'vers-caffee-loyalty';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  privateKey = privateKey.replace(/\\n/g, '\n');
}

const hasCredentials = !!(clientEmail && privateKey);

if (!admin.apps.length) {
  if (hasCredentials) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        }),
        projectId
      });
    } catch (e) {
      console.warn('Firebase Admin cert init failed:', e.message);
    }
  } else {
    try {
      admin.initializeApp({ projectId });
    } catch (e) {
      console.warn('Firebase Admin default init note:', e.message);
    }
  }
}

let db = null;
let auth = null;

try {
  db = admin.firestore();
} catch (e) {}

try {
  auth = admin.auth();
} catch (e) {}

module.exports = { admin, db, auth, hasCredentials };
