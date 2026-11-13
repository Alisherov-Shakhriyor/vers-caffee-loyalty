'use strict';

const { db, hasCredentials } = require('./_lib/firebase-admin');

const FALLBACK_STORES = [
  {
    id: 'main',
    name: 'Vers Caffee Main',
    short: 'Main Branch',
    publicCode: 'VERS_CAFFEE_MAIN',
    address: 'Amir Temur Ave 108, Tashkent',
    hours: '07:30 – 23:30',
    status: 'active'
  },
  {
    id: 's1',
    name: 'Vers Caffee Chilonzor',
    short: 'Chilonzor',
    publicCode: 'VC-CHL',
    address: 'Bunyodkor Ave 12, Chilonzor, Tashkent',
    hours: '08:00 – 23:00',
    status: 'active'
  },
  {
    id: 's2',
    name: 'Vers Caffee Yunusobod',
    short: 'Yunusobod',
    publicCode: 'VC-YUN',
    address: 'Amir Temur Ave 108, Yunusobod, Tashkent',
    hours: '07:30 – 23:30',
    status: 'active'
  },
  {
    id: 's3',
    name: 'Vers Caffee Mirobod',
    short: 'Mirobod',
    publicCode: 'VC-MIR',
    address: 'Taras Shevchenko St 7, Mirobod, Tashkent',
    hours: '09:00 – 22:00',
    status: 'active'
  },
  {
    id: 's4',
    name: 'Vers Caffee Sergeli',
    short: 'Sergeli',
    publicCode: 'VC-SER',
    address: 'Yangi Sergeli St 3, Sergeli, Tashkent',
    hours: '09:00 – 21:00',
    status: 'inactive'
  }
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const code = req.query.code || req.query.store;

  if (hasCredentials && db) {
    try {
      if (!code) {
        const snap = await db.collection('stores').where('status', '==', 'active').get();
        if (!snap.empty) {
          const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          return res.status(200).json(list);
        }
      } else {
        const snap = await db.collection('stores').where('publicCode', '==', String(code).trim()).limit(1).get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          return res.status(200).json({ id: doc.id, ...doc.data() });
        }
      }
    } catch (e) {
      console.warn('Firestore store lookup note:', e.message);
    }
  }

  // Fallback store responses
  if (!code) {
    return res.status(200).json(FALLBACK_STORES.filter(s => s.status === 'active'));
  }

  const found = FALLBACK_STORES.find(s => s.publicCode === String(code).trim() || s.id === String(code).trim());
  if (found) {
    return res.status(200).json(found);
  }

  return res.status(200).json(FALLBACK_STORES[0]);
};
