# Trip One — Design System & Engineering Standards

**The Chronicle spec sheet.** The design tokens, type system, and hard-won engineering rules behind Trip One — a grounded AI trip planner. Single reference for anyone touching the interface or shipping to production.

| | |
|---|---|
| **Product** | trip-one.pages.dev |
| **Version** | v11.0.1 |
| **Theme** | Chronicle (sole active) |
| **Stack** | Vite · React · CF Pages Functions · Cloudflare D1 |

---

## 01 — Identity

Chronicle reads like a well-kept travel journal: warm paper ground, a serif voice, and two accents that never fight — a deep teal for action and a muted gold for emphasis. It is the only shipped theme; four retired themes (Bento, Field Guide, Trail Ledger, Liquid Glass) remain in the repo unrouted. Every route renders through Chronicle regardless of a trip's stored `design_style`.

---

## 02 — Color

Six-value core, each defined for light and dark. The neutral is a warm cream biased toward the gold accent — chosen, not a default grey. Teal carries interaction; gold carries emphasis and rules only. **Never set body copy in gold on cream** — it fails contrast at text sizes.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bg-canvas` | Canvas | `#f7f2e7` | `#1a1a1a` |
| `--bg-surface` | Surface | `#fffdf8` | `#232323` |
| `--text-primary` | Ink primary | `#1a1a1a` | `#f5f0e6` |
| `--text-secondary` | Ink secondary | `#4a4438` | `#c9c3b4` |
| `--text-tertiary` | Ink tertiary | `#746c5a` | `#8f8a7c` |
| `--teal` | Action | `#1d8a7d` | `#2fa396` |
| `--teal-hover` | Action (hover) | `#166f64` | `#3ebdae` |
| `--gold` | Emphasis | `#b8912e` | `#e8b84a` |
| `--gold-hover` | Emphasis (hover) | `#967520` | `#f0c55e` |
| `--spine` | Rule / divider | `#d8cfba` | `#3a3a3a` |
| `--danger` | Danger | `#c0483f` | `#d9635a` |

Borders: hairline `rgba(26,26,26,.10)`, subtle `rgba(26,26,26,.18)`. In dark mode the border alphas flip to warm paper `rgba(245,240,230,·)`.

---

## 03 — Typography

Three roles. A serif display for headings and place names, a serif body for reading, and a monospace utility face for labels, data, and tokens. Sora carries the brand wordmark. Keep running text near 65 characters wide; headings get `text-wrap: balance`.

| Role | Family | Token |
|---|---|---|
| Display | Playfair Display → Georgia | `--font-display` |
| Body | Source Serif 4 → Georgia | `--font-body` |
| Utility / data | JetBrains Mono → ui-monospace | `--font-mono` |
| Brand mark | Sora | `--font-brand` |

> **Note:** `index.html` currently loads Fraunces / Inter / Sora from Google Fonts, while `chronicle.css` declares Playfair Display / Source Serif 4 / JetBrains Mono — so the serif faces fall back to Georgia in production. Reconcile the font links if the declared display face is meant to load.

---

## 04 — Tokens

| Spacing | Value | Radius | Value |
|---|---|---|---|
| `--space-xs` | 4px | `--radius-sm` | 4px |
| `--space-sm` | 8px | `--radius-md` | 8px |
| `--space-md` | 16px | `--radius-lg` | 14px |
| `--space-lg` | 24px | `--radius-pill` | 999px |
| `--space-xl` | 32px | | |

**Elevation & focus.** `--shadow-card` is a two-part shadow: a 1px contact edge plus a soft 20px lift. `--shadow-focus` is a double ring — a 2px canvas gap then a 2px teal ring — so keyboard focus stays visible on any surface. Every interactive element must show it.

---

## 05 — Dark mode

Dark applies when the OS prefers dark **and** the user hasn't chosen a theme, or when they explicitly toggle to dark. An explicit light choice always wins over the OS.

**The selector contract:** `:root:not([data-theme])` inside a `prefers-color-scheme: dark` query handles the automatic case; `:root[data-theme='dark']` handles the explicit toggle. Because `data-theme='light'` matches neither, it correctly keeps the light `:root` defaults. (`chronicle.css` lines 71–122.)

---

## 06 — Engineering standards

Each of these is a real bug that shipped, or a rule that stopped one. Non-negotiable on this codebase.

### Data integrity

- **Real data only — never dummy, fake, or lorem.** Every place, phrase, currency code, and forecast comes from a real source. Seed from real examples when scaffolding. Never "correct" real values that merely look malformed — confirm with the owner first.
- **Ground the AI so it cannot invent.** The planner returns only *indices* into the trip's real nearby-place list; `normalizePlan` drops any out-of-range or duplicate index. A bad model response degrades to a smaller plan — never a fabricated place. (`functions/lib/aiPlan.ts`)

### Mobile first

- **Thumb-zone shell on small screens.** A fixed bottom tab bar on ≤720px keeps navigation in reach. Reorder uses 44px up/down buttons, not HTML5 drag-and-drop, which is unreliable on touch without polyfills.
- **Any flex child that must shrink needs `min-width: 0`.** The horizontal forecast strip forced a chapter ~650px wide on a 375px phone because a flex item defaults to `min-width: auto`. Set `width:100%; min-width:0; box-sizing:border-box` so it fills the column and lets inner content scroll.

### Accessibility

- WCAG 2.1 AA minimum — verify contrast ratios, never ship gold body text on cream.
- Every interactive element shows the `--shadow-focus` ring on keyboard focus.
- Respect `prefers-reduced-motion`; respect `prefers-color-scheme`.
- Preserve non-Latin letters in slugs — a Japan/China/Russia search must not normalize to an empty slug.
- Pre-generate Edge neural TTS audio for pronunciation; browser SpeechSynthesis is unusable for CJK.

### Frontend robustness

- **Workers and browsers have no Node globals.** `process`, `Buffer`, `process.stdout` do not exist in Cloudflare Workers or the browser. Shared utility code must use `console.*`. Node-run unit tests pass and then it throws at runtime — always curl a real backend endpoint after deploy.
- **CSP allowing a domain ≠ the browser can call it.** Frankfurter has no `Access-Control-Allow-Origin` header, so the currency fetch was silently broken for its whole first build despite passing CSP. Proxy every third-party API through the backend.
- **Disable Leaflet zoom animation at construction.** `L.map(el, { zoomAnimation: false })` removes every path to the `_onZoomTransitionEnd` crash — including the map's own +/- buttons, which a `fitBounds({animate:false})` patch alone never covered. Memoize `markers`/`route` so an unrelated re-render doesn't tear down the map.

### Deploy discipline

- **Type B: `git push` does not deploy.** Cloudflare Pages here is direct upload. Push *and* `wrangler pages deploy` are separate steps. Prove a deploy reached prod by matching the built asset hash (`assets/index-<hash>.js`) against local `dist/` — a "success" message is not proof.
- Test locally before every deploy — no exceptions.
- Check the browser console for errors on the deployed build — zero tolerance.
- Route writes through a per-trip serialized queue; last-write-wins, surface a retry on failure.
- After every push, poll GitHub Actions and Railway until green before calling it done.

---

**Source of truth:** `src/themes/chronicle/chronicle.css` (design tokens) · `docs/superpowers/specs/2026-06-30-trip-one-design.md` (full spec).
**Repo:** github.com/brianference/trip-one · **Prod:** trip-one.pages.dev · **As of:** v11.0.1
