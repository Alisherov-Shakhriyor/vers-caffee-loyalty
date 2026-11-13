'use strict';

const fs = require('fs');
const path = require('path');

const files = [
  'qr_VERS_CAFFEE_MAIN.png',
  'qr_VERS_CAFFEE_MAIN.svg',
  'qr_VC-CHL.png',
  'qr_VC-CHL.svg',
  'qr_VC-YUN.png',
  'qr_VC-YUN.svg',
  'qr_VC-MIR.png',
  'qr_VC-MIR.svg',
  'qr_VC-SER.png',
  'qr_VC-SER.svg'
];

let ok = true;
for (const file of files) {
  const p = path.join(__dirname, '../assets/qr', file);
  if (!fs.existsSync(p)) {
    console.error(`Missing: ${file}`);
    ok = false;
  } else {
    const stat = fs.statSync(p);
    console.log(`✓ ${file} (${stat.size} bytes)`);
  }
}

if (!ok) process.exit(1);
console.log('All QR assets verified on disk!');
