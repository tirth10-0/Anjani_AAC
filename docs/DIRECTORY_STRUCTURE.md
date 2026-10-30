# ERP Project — Directory Structure Guide

**Stack:** Vite 5 + Plain HTML/CSS/Vanilla JS + Supabase  
**Last Updated:** October 12, 2026

---

## Root Structure

```
Afield Crop Care/
├── index.html          ← Splash/redirect entry point (DO NOT MOVE)
├── login.html          ← Authentication page (DO NOT MOVE)
├── 404.html            ← GitHub Pages 404 fallback (DO NOT MOVE)
├── manifest.json       ← PWA manifest (DO NOT MOVE)
├── .nojekyll           ← Required for GitHub Pages (DO NOT MOVE)
├── vite.config.js      ← Vite multi-page build config (DO NOT MOVE)
├── package.json        ← NPM configuration (DO NOT MOVE)
│
├── pages/              ← ERP page HTML files (all linked in vite.config.js)
├── assets/             ← All frontend assets served at runtime
├── apps/               ← Standalone sub-applications
├── database/           ← All SQL files, organized by purpose
├── scripts/            ← Build-time and dev utility scripts
├── tests/              ← Automated tests and diagnostic scripts
├── docs/               ← Project documentation
└── .github/workflows/  ← CI/CD deployment
```

---

## Where to Add New Files

### New ERP Page
1. Create `pages/your-page.html`
2. Add JS module to `assets/js/your-page.js`
3. Register the new page in `vite.config.js` under `build.rollupOptions.input`
4. Add navigation link in `assets/js/shared-layout.js`

### New Stylesheet
- **Global/shared styles** → `assets/css/style.css` or a new `assets/css/your-feature.css`
- **Component styles** → `assets/css/components/your-component.css`
- Reference from pages as `../assets/css/your-file.css`

### New JS Utility (shared across pages)
- Add to `assets/js/utils.js` if it's a small helper
- Create `assets/js/your-util.js` if it's a significant standalone utility
- Load it in every page that needs it before the page-specific script

### New Reusable UI Component
- JS logic → `assets/js/components/your-component.js`
- CSS → `assets/css/components/your-component.css`

### New Database Migration
- Create `database/migrations/YYYY-MM-DD-description.sql`
- Format: `YYYY-MM-DD-short-description.sql`
- Use `IF NOT EXISTS` / `IF EXISTS` for safety

### One-time Fix SQL
- Place in `database/fixes/fix_description.sql`

### Setup/Seed SQL
- Place in `database/setup/`

### Build/Dev Utility Script
- Place in `scripts/`

### Test or Diagnostic Script
- Automated test → `tests/test_your_feature.js`
- Dev diagnostic → `tests/scripts/your_script.js`
- Temporary/scratch → `tests/scratch/your_script.js`

---

## `database/` Organization

```
database/
├── migrations/     ← Versioned, dated schema changes (YYYY-MM-DD-*.sql)
├── schema/         ← Reference schema definitions (read-only reference)
├── fixes/          ← One-time fix scripts run against production
├── setup/          ← Full setup, seed, and restoration scripts
└── dev/            ← Dev/debug SQL (never run on production)
```

---

## `apps/` Sub-applications

| App | Location | Stack | Purpose |
|-----|----------|-------|---------|
| Formulations | `apps/Formulations/` | React + Vite | Standalone formulation editor (builds to `assets/formulations-build/`) |
| Invoice Builder | `apps/Invoice Builder/` | Plain HTML + Node.js | Standalone invoice generation server |

> Each sub-app has its own `package.json` and `node_modules/` (gitignored). Run `npm install` inside each sub-app folder before developing.

---

## Critical Files — Do Not Move or Rename

| File | Reason |
|------|--------|
| `index.html` | Entry point, hardcoded in vite.config.js |
| `login.html` | Auth page, hardcoded in vite.config.js |
| `404.html` | Required at root for GitHub Pages |
| `manifest.json` | PWA, referenced from all pages as `../manifest.json` |
| `.nojekyll` | Disables Jekyll on GitHub Pages |
| `pages/*.html` | All referenced in vite.config.js + cross-page links |
| `assets/js/database.js` | Supabase client — loaded globally |
| `assets/js/inventory-core.js` | Authoritative inventory engine |
| `assets/js/shared-layout.js` | Sidebar/topbar injection |
| `assets/js/app.js` | Auth guard + UI primitives |
| `assets/js/utils.js` | Shared utility functions |
| `database/migrations/` | Do not delete or reorder migrations |

---

## Load Order in Every Page

Every `pages/*.html` must load scripts in this exact order:

```html
<!-- 1. CDN (always first) -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- 2. Layout (runs before DOMContentLoaded) -->
<script src="../assets/js/shared-layout.js?v=..."></script>

<!-- 3. Core services -->
<script src="../assets/js/database.js?v=..."></script>
<script src="../assets/js/inventory-core.js?v=..."></script>
<script src="../assets/js/utils.js?v=..."></script>

<!-- 4. Components -->
<script src="../assets/js/components/search-select.js?v=..."></script>

<!-- 5. App shell (auth guard, toast, modal) -->
<script src="../assets/js/app.js?v=..."></script>

<!-- 6. Page-specific (always last) -->
<script src="../assets/js/your-page.js?v=..."></script>
```

After adding any new script, run `node scripts/bump-cache.cjs` to refresh `?v=` cache-busting timestamps.
