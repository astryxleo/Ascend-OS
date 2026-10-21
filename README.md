# LUMEN — Ascend OS

**An ultra-luxury study operating system for Leo & Ri.**

LUMEN combines a premium desktop-like workspace with a Class XII syllabus tracker, planner, focus sessions, achievements, analytics, exams, and a hypercar-inspired study economy.

## Current build
The initial runnable frontend is a self-contained responsive web app in `index.html`. It includes interactive navigation, profile switching, planner task completion/creation, a focus timer, syllabus progress, and local browser persistence for tasks and profile. Dashboard metrics and sample progress are illustrative demo data until a secured backend is connected.

## Run locally
Open `index.html` in a modern browser, or serve this repository with any static web server.

## Planned production architecture
- TanStack Start + React + TypeScript
- Tailwind CSS v4, Lucide, charts and toast notifications
- PostgreSQL/Supabase-compatible schema with RLS and server-validated mutations
- Secure OAuth identity mapping and protected admin-only vehicle image management
- Server-side AI Study Kit, caching, offline fallback, installable PWA

## Security note
Do not commit credentials, service-role keys, or AI gateway secrets. The current frontend demo must not be treated as production authentication or a trusted source for XP, balances, purchases, or role authorization. Those operations require server-side validation and database policies.
