/**
 * VERS CAFFEE LOYALTY — Frontend Configuration
 */

// Public Firebase Web Client configuration (safe to expose in client)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBT77ON5xArfocEgWtdadgOEOL-fAVrmjw",
  authDomain: "vers-caffee-loyalty.firebaseapp.com",
  projectId: "vers-caffee-loyalty",
  storageBucket: "vers-caffee-loyalty.firebasestorage.app",
  messagingSenderId: "1046498836601",
  appId: "1:1046498836601:web:bbe39bfb8b9a9ecd9954a8"
};

// Base URL for API endpoints (defaults to same origin for Vercel deployment)
export const API_BASE = window.location.origin;

// Business constants
export const THRESHOLD = 10;
export const DAILY_LIMIT = 1;
export const TIMEZONE = 'Asia/Tashkent';
export const DEFAULT_STORE = 'VERS_CAFFEE_MAIN';
