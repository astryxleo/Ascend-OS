# Ascend OS — Luxury Study OS

A responsive Class XII study dashboard built with React, TypeScript, Vite, Supabase Auth, and PostgreSQL.

## Current implementation
- Premium obsidian / titanium / gold UI with responsive sidebar.
- Supabase magic-link and Google OAuth sign-in entry points.
- Account-scoped profile, wallet, chapter progress and daily planner reads.
- First-login profile onboarding with image compression and account-scoped avatar storage.
- Persisted planner task creation and completion.
- Server-timestamped focus session start, recovery after reload, and one-time server-side rewards.
- SQL foundation for profiles, wallets, syllabus progress, focus sessions, planner tasks, exams, vehicles, wallet audit, broadcasts, and activity events.

Some screens are intentionally labeled as the next module; do not treat mock graphs, the local focus timer, or placeholder screens as production features.

## Local development
1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using the Supabase project settings. Publishable/anon keys may be exposed to the browser; never use a service-role key here.
4. In Supabase Auth, enable Google OAuth and configure provider credentials and redirect URLs. Configure email magic links and allowed redirect URLs for localhost and your deployed domain.
5. Run `npm install`, then `npm run dev`.

## Database
The initial schema migration is in `supabase/migrations/202610210001_ascend-os_core_schema.sql`. It has been applied to the connected Supabase project during initial setup. Do not run the initial schema again on the same project; use migration-aware deployment for future changes.

## Operator security
The database helper verifies either a verified JWT email matching `astryxleo@gmail.com` or an operator role in the profile table. The client only hides/shows the operator navigation; every sensitive operation must still be guarded by database RLS or server-side authorization. Verify the intended Google account is actually verified before using operator tools.

## Not production-complete yet
- OAuth provider configuration and redirect URL verification.
- Full NCERT chapter/exercise seed data.
- Focus timer QA across tab suspension, device sleep, and deliberate pause/reset edge cases.
- Wallet purchases, atomic inventory checks, and rewards anti-abuse controls.
- AI Study Kit Edge Function and caching.
- Exam CRUD and analytics, public profiles/duels, and realtime broadcasts.
- Operator search/airdrop/broadcast/vehicle management forms and audit views.
- Storage bucket setup and per-user object policies.
- Automated tests, accessibility audit, and deployment verification.
- Run `npm run build` locally or confirm the GitHub Actions build before treating the latest frontend as production-verified.
- Confirm GitHub Actions build status; no successful build result has been observed yet.
- CI workflow is committed; build status still needs to be confirmed from GitHub Actions.


## Latest implementation milestone
- Interactive syllabus atlas: 57 chapter groups and 468 trackable checkpoints across six subjects, with per-user progress and search/filter controls.
- Planner day history with date navigation and the 4 AM IST study-day boundary.
- Exam command center with persistent exams, countdowns, marks entry and score summaries.
- Garage/dealership: 30 seeded vehicles across five tiers, search/filter/sort, collection and favorites.
- Secure `purchase_vehicle` database RPC atomically checks availability, stock, duplicate ownership and wallet balance before recording the purchase.
- Production build and end-to-end browser verification are still pending.

- Operator Control Center now includes server-authorized overview telemetry, scoped user search with progress and wallet balances, audited coin/cash adjustments, and publish/unpublish broadcast controls.
