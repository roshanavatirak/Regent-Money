# Regent Money

## Vision
A mobile (and web) personal‑finance app that helps users track, categorize, and review their daily transactions (including SMS‑based payment notifications) and receive timely reminders/insights to stay on top of spending.

## Core Value
Enable users to instantly see their cash flow and receive actionable insights, all without complex budgeting or AI‑driven forecasting.

## Target Users
1. Individual consumers who want a simple, low‑friction way to monitor cash flow.
2. Small‑business owners / freelancers needing quick transaction over‑views and SMS‑based payment verification.

## Technical Context
- **Frontend** – React Native using **Expo v56** (per the project rule to follow the exact Expo docs).
- **Backend** – Node.js (NestJS) with TypeScript (`backend/src/**/*.ts`).
- **Database / Auth** – Supabase (PostgreSQL + auth) as the managed backend.

### Stack Decisions (User‑chosen vs AI‑suggested)
| Component | Source | Choice |
|-----------|--------|--------|
| UI Framework | User | React Native (Expo v56) |
| Backend Framework | User | NestJS (TypeScript) |
| DB / Auth | User | Supabase |
| SMS Parsing | User | SMS‑based payment notifications |
| Additional libs | — | None (keep lightweight) |

## Constraints / Non‑Goals (v1)
- No complex budgeting or AI‑driven forecasting.
- Mobile‑first: focus on iOS/Android via Expo; no desktop‑only UI.
- No custom payment gateway integration – rely on SMS parsing & CSV imports.
- Keep the codebase lightweight (no heavy UI libraries, no server‑side rendering).

## Success Criteria
1. Users can install the app via Expo Go and log in with Supabase auth.
2. Incoming SMSes are captured, parsed, and displayed as transactions in **< 5 seconds**.
3. Users can filter/search transactions and view a review modal (e.g., `ReviewTransactionsModal.tsx`).
4. Sync with the backend runs without errors (`sync.module.ts`).
5. No crashes on iOS & Android devices (tested on two emulators + one physical device).
6. UI response < 200 ms, backend sync latency < 1 s.

---
*Last updated: 2026‑10‑04*
