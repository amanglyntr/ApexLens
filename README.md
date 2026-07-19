# Salesforce Apex Lens

Salesforce Apex Lens is a security-first Salesforce code evaluation utility. It uploads source directly to private Supabase Storage, masks confidential values before AI review, processes dependency-aware review units, and produces evidence-based findings and reports.

## Quick start

1. Create a local `.env` file and add the required Supabase browser credentials.
2. Run `npm install`.
3. Run `npm run dev`.

The application uses Supabase Auth, PostgreSQL, private Storage, Edge Functions, and structured Claude review responses.

## Install as an app

The web client is a Progressive Web App. It can be installed from supported desktop browsers and Android using the **Install app** control. On iPhone or iPad, open it in Safari, use **Share**, then select **Add to Home Screen**.

For a production-equivalent local test:

```powershell
npm run build
npm run preview
```

Open `http://localhost:4173` on the same computer and install it from the browser. The complete app shell and local mock workspace are stored on-device, so the demo remains usable after going offline. Supabase-backed authentication, uploads, and analysis naturally require network access.

Mobile installation from another device requires the site to be served over trusted HTTPS; plain `http://<computer-ip>` is suitable for responsive testing but browsers will not register a PWA there.

## Development progress

- [x] Vite, React, TypeScript workspace
- [x] Tailwind design system with light, dark, and system themes
- [x] Supabase database schema and Row Level Security policies
- [x] Private Storage buckets and owner-scoped policies
- [x] Shared TypeScript domain models and Zod validation
- [x] Authentication shell with credential-free demo mode
- [x] Dashboard and recent project overview
- [x] Project creation and direct ZIP/file upload experience
- [x] Polling-based staged mock analysis
- [x] Live preliminary findings
- [x] Mock health dashboard and final report
- [x] Installable PWA with offline app shell and persistent local demo data
- [x] Android maskable and iOS home-screen assets
- [ ] Secure ZIP extraction and archive limits
- [ ] Production masking and dependency-aware review units
- [ ] Claude integration and structured-output repair
- [ ] Cross-project validation, deduplication, and exports
- [ ] Stalled-job cron recovery and cleanup

## Architecture

- `apps/web` — Vite React frontend
- `supabase/migrations` — PostgreSQL schema, RLS, and Storage policy setup
- `supabase/functions` — Edge Function workflow foundations and shared contracts

Original source stays in private Storage. Only masked source is eligible for model processing. The frontend polls every five seconds; Realtime is intentionally not used.
