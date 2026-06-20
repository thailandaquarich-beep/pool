---
name: Aquarich Pool Reservation System
description: Key decisions and quirks for the Aquarich swimming pool reservation project
---

# Aquarich Pool Setup

**Why:** Captured after full setup from ZIP file — non-obvious issues that would cause silent failures.

## Critical dependencies
`bcryptjs`, `jsonwebtoken`, `@types/bcryptjs`, `@types/jsonwebtoken` must be in `artifacts/api-server/package.json` — they are NOT in the base template.

## DB Schema
Schema files live in `lib/db/src/schema/` (users, reservations, settings, facilities, instructors, announcements). The index.ts exports all tables. Run `pnpm --filter @workspace/db run push` after any schema change.

## API URL routing
The OpenAPI spec has `servers: - url: /api` which causes orval to generate hooks with `/api/...` prefix. The Vite proxy is NOT needed because Replit's path-based routing sends `/api/*` to the API server and `/*` to the frontend.

## Auth token
`main.tsx` calls `setAuthTokenGetter(() => localStorage.getItem("pool_token"))`. Token key is `pool_token`. Admin pages use raw fetch with `localStorage.getItem("pool_token")` + `${baseUrl}/api/...` where baseUrl = `import.meta.env.BASE_URL.replace(/\/$/, "")`.

## Seed accounts
- Admin: username=`admin`, password=`admin1234`, email=`admin@aquarich.com`
- Member: username=`member1`, password=`member1234`, email=`member@test.com`

## How to apply
When returning to this project, verify: API server running on port 8080, pool-reservation on port 24727, DB schema pushed. If API returns HTML 404s, restart the API server workflow (stale build).
