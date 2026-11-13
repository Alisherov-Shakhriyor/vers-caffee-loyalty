'use strict';

const { db } = require('./_lib/firebase-admin');

const STORES = [
  {
    id: 's1',
    name: 'Vers Caffee Chilonzor',
    short: 'Chilonzor',
    publicCode: 'VC-CHL',
    address: 'Bunyodkor Ave 12, Chilonzor, Tashkent',
    manager: 'Dilshod Ergashev',
    hours: '08:00 – 23:00',
    timezone: 'Asia/Tashkent',
    status: 'active',
    dailyStampLimit: 1,
    rewardThreshold: 10,
    createdAt: new Date().toISOString()
  },
  {
    id: 's2',
    name: 'Vers Caffee Yunusobod',
    short: 'Yunusobod',
    publicCode: 'VC-YUN',
    address: 'Amir Temur Ave 108, Yunusobod, Tashkent',
    manager: 'Gulnora Rustamova',
    hours: '07:30 – 23:30',
    timezone: 'Asia/Tashkent',
    status: 'active',
    dailyStampLimit: 1,
    rewardThreshold: 10,
    createdAt: new Date().toISOString()
  },
  {
    id: 's3',
    name: 'Vers Caffee Mirobod',
    short: 'Mirobod',
    publicCode: 'VC-MIR',
    address: 'Taras Shevchenko St 7, Mirobod, Tashkent',
    manager: 'Timur Sobirov',
    hours: '09:00 – 22:00',
    timezone: 'Asia/Tashkent',
    status: 'active',
    dailyStampLimit: 1,
    rewardThreshold: 10,
    createdAt: new Date().toISOString()
  },
  {
    id: 's4',
    name: 'Vers Caffee Sergeli',
    short: 'Sergeli',
    publicCode: 'VC-SER',
    address: 'Yangi Sergeli St 3, Sergeli, Tashkent',
    manager: 'Farhod Mirzaev',
    hours: '09:00 – 21:00',
    timezone: 'Asia/Tashkent',
    status: 'inactive',
    dailyStampLimit: 1,
    rewardThreshold: 10,
    createdAt: new Date().toISOString()
  },
  {
    id: 'main',
    name: 'Vers Caffee Main',
    short: 'Main Branch',
    publicCode: 'VERS_CAFFEE_MAIN',
    address: 'Amir Temur Ave 108, Tashkent',
    manager: 'Head Barista',
    hours: '07:30 – 23:30',
    timezone: 'Asia/Tashkent',
    status: 'active',
    dailyStampLimit: 1,
    rewardThreshold: 10,
    createdAt: new Date().toISOString()
  }
];

module.exports = async function handler(req, res) {
  try {
    const batch = db.batch();
    for (const store of STORES) {
      const ref = db.collection('stores').doc(store.id);
      batch.set(ref, store, { merge: true });
    }
    await batch.commit();
    return res.status(200).json({ ok: true, seeded: STORES.length, stores: STORES.map(s => s.publicCode) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
