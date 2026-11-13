'use strict';

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const BASE_URL = 'https://vers-caffee-loyalty.vercel.app';

const BRANCHES = [
  { code: 'VERS_CAFFEE_MAIN', name: 'Main Branch' },
  { code: 'VC-CHL', name: 'Chilonzor' },
  { code: 'VC-YUN', name: 'Yunusobod' },
  { code: 'VC-MIR', name: 'Mirobod' },
  { code: 'VC-SER', name: 'Sergeli' }
];

const assetsDir = path.join(__dirname, '../assets/qr');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

async function generateAll() {
  console.log('Generating QR codes for VERS CAFFEE branches...');

  for (const b of BRANCHES) {
    const url = `${BASE_URL}/?store=${b.code}`;
    const pngPath = path.join(assetsDir, `qr_${b.code}.png`);
    const svgPath = path.join(assetsDir, `qr_${b.code}.svg`);

    // 1. High-resolution PNG (600x600, high error correction 'H', black on white)
    await QRCode.toFile(pngPath, url, {
      errorCorrectionLevel: 'H',
      width: 600,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // 2. Vector SVG format
    const svgString = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    fs.writeFileSync(svgPath, svgString, 'utf8');

    console.log(`✓ ${b.name} (${b.code}):`);
    console.log(`  URL: ${url}`);
    console.log(`  PNG: ${pngPath}`);
    console.log(`  SVG: ${svgPath}`);
  }

  console.log('\nAll branch QR codes generated successfully!');
}

generateAll().catch(err => {
  console.error('Error generating QR codes:', err);
  process.exit(1);
});
