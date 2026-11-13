'use strict';

const { db } = require('./_lib/firebase-admin');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const code = req.query.code || req.query.store;
  if (!code) {
    // Return all active stores list
    try {
      const snap = await db.collection('stores').where('status', '==', 'active').get();
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      return res.status(200).json(list);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  try {
    const snap = await db.collection('stores').where('publicCode', '==', String(code).trim()).limit(1).get();
    if (snap.empty) {
      // Check document ID directly
      const direct = await db.collection('stores').doc(String(code).trim()).get();
      if (!direct.exists) {
        return res.status(404).json({ error: 'Store not found' });
      }
      return res.status(200).json({ id: direct.id, ...direct.data() });
    }
    const doc = snap.docs[0];
    return res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
