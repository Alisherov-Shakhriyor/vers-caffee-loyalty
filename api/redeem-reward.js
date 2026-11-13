'use strict';

const { db, auth } = require('./_lib/firebase-admin');
const { processRewardRedemption } = require('./_lib/logic');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Firebase ID token required.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }

  const result = await processRewardRedemption(db, decodedToken.uid);
  return res.status(result.ok ? 200 : 400).json(result);
};
