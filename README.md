# VERS CAFFEE LOYALTY — Telegram Mini App

Production-ready Customer Loyalty System for VERS CAFFEE branches, built as a high-retention Telegram Mini App with Firebase Authentication, Cloud Firestore real-time persistence, server-side HMAC validation, anti-replay daily stamp limits, camera QR scanning, and NFC tag support.

---

## ☕ Visual Identity & Core Concept

- **Brand Aesthetic:** Coffee-inspired palette with cream background (`#F6F0E8`), espresso card (`#3A2418`), warm brown accents (`#6F4E37`), and caramel stamp indicators (`#D9A066`).
- **Typography:** Fraunces (display headlines) & Inter (clean UI numbers and prose).
- **One Loyalty Card Across All Branches:** A customer carries a single loyalty card valid at Chilonzor, Yunusobod, Mirobod, Sergeli, and the Main Branch.
- **Reward Mechanics:** 10 stamps unlock a free coffee reward.
- **Daily Limit:** Strictly 1 stamp per customer per calendar day across all branches, calculated in the `Asia/Tashkent` timezone on the server.

---

## 🏗️ Architecture & Security Model

```text
vers-caffee/
├── index.html                  # Responsive mobile-first customer shell
├── js/
│   ├── app.js                  # Main UI controller & state machine
│   ├── config.js               # Firebase public config & constants
│   ├── firebase.js             # Firebase v10 modular Auth & Firestore SDK
│   ├── telegram-auth.js        # Telegram WebApp initData extractor
│   ├── api.js                  # Production API service layer
│   └── ui.js                   # SVG icons, formatting, badges, toasts
├── api/                        # Vercel Serverless Functions
│   ├── auth.js                 # Cryptographic Telegram HMAC verification & token minting
│   ├── collect-stamp.js        # Atomic stamp collection endpoint
│   ├── redeem-reward.js        # Atomic reward redemption endpoint
│   ├── store.js                # Public store resolution
│   ├── seed.js                 # Initial branch seeder
│   └── _lib/                   # Firebase admin & shared logic
├── firebase/
│   ├── firestore.rules         # Zero-client-write security rules
│   ├── firestore.indexes.json  # Composite Firestore indexes
│   └── functions/              # Firebase Cloud Functions (2nd Gen)
│       ├── index.js            # Cloud Functions entrypoints
│       ├── telegram.js         # HMAC-SHA256 signature verifier
│       ├── stamps.js           # Atomic Firestore transactions
│       └── security.js         # Rate limiting & security event logging
├── test/
│   └── run-tests.js            # Automated verification test suite (19 tests)
├── vercel.json                 # Vercel production configuration
├── firebase.json               # Firebase CLI configuration
└── README.md
```

### Security Guarantees:
1. **Never Trust the Client:** Customers CANNOT increment their own stamps. All Firestore writes for stamps and rewards are strictly denied by `firestore.rules`.
2. **Cryptographic Telegram Identity:** Every request verifies the raw `Telegram.WebApp.initData` with `HMAC_SHA256(bot_token, data_check_string)`. Tampered user IDs or expired authentication sessions (>24 hours) are rejected.
3. **Deterministic Anti-Replay Ledger:** A deterministic document `dailyStampClaims/claim_{telegramUserId}_{localDate}` prevents any customer from acquiring more than 1 stamp per day, even across concurrent requests or multiple branches.
4. **Idempotency Keys:** Duplicate network requests cannot double-count stamps.
5. **Static QR / NFC Transparency:** Static QR codes and NFC tags encode public branch identifiers (e.g. `https://vers-caffee-loyalty.vercel.app/?store=VERS_CAFFEE_MAIN`). They identify the branch, while server-side daily limits, Telegram authentication, and rate limiting prevent abuse. As with all static identifier schemes, they do not provide cryptographic proof of physical counter presence.

---

## 🤖 Telegram BotFather Setup

To connect this application to Telegram:

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Create a new bot or select an existing bot: `/newbot` or `/mybots`.
3. Select **Bot Settings** → **Menu Button** → **Configure Menu Button**.
4. Enter the deployed Vercel production URL:
   `https://vers-caffee-loyalty.vercel.app/`
5. Alternatively, create a Web App attachment via `/newapp` and link it to:
   `https://vers-caffee-loyalty.vercel.app/`
6. Set the bot token in your environment variables as `TELEGRAM_BOT_TOKEN`.

---

## 📱 QR Code & NFC Tag Specification

### QR Code:
- Encodes: `https://vers-caffee-loyalty.vercel.app/?store=VERS_CAFFEE_MAIN`
- High error correction level `H`.
- Black modules on white background, print-ready.

### NFC Tag:
- Type: NDEF URI record (NFC Forum Type 2/4 tag).
- Exact Record Content: `https://vers-caffee-loyalty.vercel.app/?store=VERS_CAFFEE_MAIN&source=nfc`
- Compatible with all NFC-enabled iOS & Android smartphones.

---

## 🧪 Testing

Run the automated test suite locally:

```bash
node test/run-tests.js
```

Covers:
- Telegram HMAC-SHA256 verification (valid, tampered, expired)
- In-memory and persistent rate limiting
- Tashkent timezone date resolution
- 10-stamp threshold and 1-stamp daily limit enforcement
- Card completion, reward redemption, and reset cycles
- Secrets audit (verifying no leaked service accounts in frontend files)
