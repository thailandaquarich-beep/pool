---
name: Aquarich New Features
description: Wallet, Topup, Membership Packages, Chat tickets, Profile image, LINE floating button — what was built and key decisions
---

## Features shipped

### DB Schema (7 new tables)
- wallets, transactions, topup_requests, membership_packages, member_packages, chat_tickets, chat_messages
- users: added `profile_image_url` (text, nullable), extended role enum to include `instructor`, `super_admin`
- settings: added bookingPricePerSession (numeric), lineUrl, contactPhone, contactEmail, bankAccountName, bankAccountNumber, bankName, promptpayNumber

### API Routes (new files, all registered in routes/index.ts)
- `/wallet` — wallet.ts; `getOrCreateWallet()` exported for use by topup/packages routes
- `/topup` — topup.ts; member submit, admin approve/reject with wallet credit
- `/packages` — packages.ts; CRUD + member purchase (deducts wallet)
- `/chat` — chat.ts; ticket + message system with admin unread count polling
- `POST /auth/change-password` — added to auth.ts
- `PATCH /users/:id` — updated to handle profileImageUrl (base64 stored in DB)

### Frontend Pages (raw fetch pattern, no codegen needed)
- `/wallet` — WalletPage: gradient balance card + transaction history
- `/topup` — Topup: amount presets, method selector, slip upload (base64), bank info from settings
- `/packages` — Packages: package cards, AlertDialog purchase confirm, my packages section
- `/chat` — ChatPage: ticket list + chat view (10s polling), new ticket form; works for both member and admin
- `/admin/wallet-management` — AdminWalletManagement: topup approval with slip image preview
- `/admin/packages-management` — AdminPackagesManagement: full CRUD with dialog
- Profile page: avatar upload (base64 → PATCH /users/:id), change password section (collapsible)
- LINE floating button: reads lineUrl from settings; hidden when null

### Admin Settings
- Added Payment section (bookingPricePerSession, bank details, PromptPay)
- Added Contact/LINE section (lineUrl, contactPhone, contactEmail)

### Sidebar
- Member: +wallet, packages, chat links
- Admin: +wallet, packages, chat (with unread badge polling every 30s)
- Profile avatar shown in sidebar footer if profileImageUrl is set

## Key decisions
**Why base64 for images?** No object storage configured. Stored in TEXT columns. Limit enforced in UI (3MB avatar, 5MB slip). Acceptable for MVP.
**Why raw fetch instead of codegen for new pages?** Adding 20+ OpenAPI paths would take much longer; raw fetch is consistent with existing admin pages pattern.
**Why polling for chat?** No WebSocket infrastructure; 10s polling in chat view, 30s for unread count in sidebar — lightweight and sufficient.
