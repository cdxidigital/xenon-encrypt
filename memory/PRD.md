# Xenon Messenger — Product Requirements Document

## Overview
Xenon Messenger is a privacy-first, end-to-end-encrypted messenger inspired by BBM, built as a React Native (Expo) mobile application with a FastAPI stateless-relay backend.

## Core Features Delivered
- **Multi-identity system** — Xenon IDs in `XEN-XXXX-XXXX` format, switchable, including disposable identities
- **Stateless relay backend** — FastAPI with MongoDB; only encrypted ciphertext blobs persist for delivery; panic wipe wipes everything
- **Simulated E2E encryption** — client-side XOR cipher keyed by per-chat session key; backend never sees plaintext
- **1-on-1, group, and broadcast chats** with encryption lock indicators, typing, read receipts (✓/✓✓), self-destruct timers
- **Session fingerprint** — SHA-256 derived, 8×5 grouped monospace display, shown in slide-up Security Panel with X3DH/AES-256/Curve25519 metric chips
- **Advanced modes** — Ghost (hide read receipts/typing), Burn (auto-delete with visible countdown), Vault (hidden chats + PIN gate), Panic (wipe), Decoy (hides vault from list)
- **Themes** — Obsidian (default), Frost, Nebula, Amber Vault; each a full palette swap with preview chips in settings
- **AI features** — Smart Reply suggestions (3 chips) and chat Summarization powered by Emergent LLM key (Claude Sonnet 4.5)
- **Contacts** — add by XID with format validation, verify/trust score, discover suggestions from other local identities
- **Real-time polling** — 2.5s chat polling, 4s chat-list polling, typing indicator heartbeat

## Tech Stack
- **Frontend**: Expo SDK 54, React Native 0.81, expo-router 6, lucide-react-native, AsyncStorage, expo-crypto
- **Backend**: FastAPI, Motor (MongoDB async), Pydantic v2, emergentintegrations (Claude)
- **Data**: MongoDB collections — `identities`, `contacts`, `chats`, `messages`

## Key API Endpoints (all `/api` prefixed)
- `POST /identities`, `GET /identities`, `DELETE /identities/{xid}`
- `POST /contacts`, `GET /contacts?owner_xid=...`, `POST /contacts/{id}/verify`
- `POST /chats`, `GET /chats?xid=...&include_vault=...`, `GET /chats/{id}`, `PATCH /chats/{id}`, `DELETE /chats/{id}`, `GET /chats/{id}/fingerprint`
- `POST /messages`, `GET /messages?chat_id=...&since=...`, `POST /messages/{id}/read`, `POST /messages/{id}/destroy`
- `POST /typing`, `GET /typing`
- `POST /panic`
- `POST /ai/summarize`, `POST /ai/smart-reply`

## Design System
Built from `/app/design_guidelines.json` — 8pt spacing grid, JetBrains Mono for XIDs/fingerprints, acid-green for encryption state, electric cyan for CTAs, no purple/violet gradients.

## Out of Scope (intentional MVP trade-offs)
- Real Signal Protocol (libsignal) / WebRTC voice/video calls — simulated via UI
- Native desktop apps, Tor routing, mesh peer-fallback
- Hardware key integration
- File/image/audio attachments (placeholder alert; text + ciphertext is fully E2E demo)
