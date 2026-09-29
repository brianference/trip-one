# Photo controls (Option A) and invite-to-add-photos: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Put photos and a distinct "Add photos" action at the top of the stop popup and in the "Your trip" header, and let a recap viewer the trip owner invited by email sign in (or create an account) with an emailed code, join the trip, and add photos.

**Architecture:** UI follows the approved design `docs/design/photo-controls-option-a.html` (screenshot `docs/design/photo-controls-option-a.png`, 8 sections). A new accent token (dusk-700 on white) marks photo actions. Server adds passwordless email-code sign-in, trip invites keyed by email, and a join endpoint that must only reveal the trip id to a signed-in user whose verified email was invited. Photo upload authorization is unchanged (the trip link is the capability); joining hands the invited member that link.

**Tech stack:** React 18 + react-router 6, Vite 5, TS strict, Tailwind v4 + Chronicle CSS, Vitest + Testing Library, Cloudflare Pages Functions, D1, R2, Brevo email (functions/lib/email.ts).

**Spec:** the owner's messages of 2026-09-29 (quoted in the appendix) plus the approved design file above. Executors read both.

## Facts this plan rests on (checked 2026-09-29)

| Fact | Evidence |
|---|---|
| The stop popup's photo section is the last block and only renders after details load (`showBody = !loading`). | [VERIFIED: src/features/trip/place/PlaceDetailPanel.tsx ~96, ~235-263, read 2026-09-29] |
| The "Your trip" header is `div.mb-4.flex…` with h1, date/length labels, `<TripExport>` (Print / PDF) and a "View trip recap" link. | src/features/trip/pages/TripPlanPage.tsx ~98-124 |
| No email-code sign-in exists and auth is password plus link confirm/reset [VERIFIED: grep for one-time-code, code/request and otp in functions and src found nothing, 2026-09-29]; `users.password_hash` is NOT NULL [VERIFIED: d1/migrations/0002_users.sql:20]. | [VERIFIED: grep for one-time-code/code/request/otp in functions and src returned nothing; d1/migrations/0002_users.sql:20 `password_hash text not null`, read 2026-09-29] |
| Tokens are random, stored only as sha256 hashes, one-time via `used_at` [VERIFIED: functions/lib/auth/tokens.ts:15 and d1/migrations/0004_email.sql:32,42]. | [VERIFIED: functions/lib/auth/tokens.ts:15 sha256hex; d1/migrations/0004_email.sql:32,42 used_at, read 2026-09-29] |
| The public recap server-side knows `link.trip_id` and strips it from the payload. | functions/api/recap/[token].ts |
| Recap-link and photo endpoints use the trip URL as the capability (no auth) and refuse demo trips. | [VERIFIED: functions/api/trips/[id]/recap-link.ts guard(), read 2026-09-29] |
| Orange (dusk) is defined in theme.css but its comment reserves it for the logo; the owner now explicitly asked for a different-colour photo button, and the approved design uses dusk-700 #9a4616 with white text. | src/styles/theme.css; owner message 2026-09-29 |
| LoginPage returns to `location.state.from` (default /my-trips). No `?next=`. | src/features/auth/LoginPage.tsx |
| `sendEmail(env, to, subject, html)` never throws; returns `{sent, stubbed?, error?}`; without BREVO_API_KEY it stubs. | functions/lib/email.ts |

## Decisions

1. **Who can add photos:** the approved design says "the trip owner invited this email", so invited people can. The owner invites from the Share recap sheet (not in the design; built in Option A's style).
2. **Who can invite:** anyone holding the trip link, the same capability model as editing the itinerary and sharing the recap. Demo trips refuse.
3. **Sign-in by code creates the account if it doesn't exist** (design step 1 "Sign in or create an account"). Code-created users must be given an unusable password hash (random, never shown) and `email_verified = 1`; they can set a password later with the existing reset flow.
4. **Joining reveals the trip link** only to a signed-in user whose account email is verified AND matches a non-revoked invite for that recap's trip. Everyone else gets 403 with "This email isn't invited to this trip".
5. **Header "Add photos"** opens a small "Which stop?" sheet (stops of the selected day, then other days) and then the file picker, since a photo must belong to a stop.

## Global constraints

- TypeScript strict. JSDoc on every function. No `console.*` (logger). Named constants for every limit.
- Zod on every body/param; parameterized SQL only; local `json(body,status)` helper; user-facing error text.
- Every new write endpoint is rate-limited with `isRateLimited`. Auth-code endpoints must also be limited per email.
- Codes: 6 digits from `crypto.getRandomValues` (rejection sampling, no modulo bias), stored only as sha256 of `email + ':' + code`, expire in 10 minutes, max 5 wrong attempts per code, one active code per email, one-time use. Code request always answers `{ok:true}` whatever the email.
- Pages Functions responses do not get `_headers` (https://developers.cloudflare.com/pages/configuration/headers/): set `Cache-Control: private, no-store` on auth/invite/join responses in code.
- Touch targets ≥ 44px; WCAG AA measured with axe in both themes; theme tokens only; match the approved design.
- New migration `d1/migrations/0007_invites_codes.sql`, added to `scripts/verify-schema.mjs`; not applied to remote inside a task.
- `npm test`, `npx tsc -b`, `npm run build` pass at the end of every task. Commit with `git commit -F`. Never push.

## Review focus

1. **Brute-forcing a code.** 6 digits = 1,000,000 values; 5 attempts per code plus per-IP and per-email limits must make guessing infeasible. Test: 6th attempt on a code fails even with the right code.
2. **Joining a trip you weren't invited to.** A signed-in user with a different email, an unverified email, or a revoked invite gets 403, and the response never contains the trip id. Test each.
3. **Account enumeration.** Code request and invite responses must not reveal whether an email has an account.
4. **A code sent to one email used for another.** The hash binds the email; verifying code X for email B fails.
5. **Photos-first popup while details load.** The photo section renders immediately, before and regardless of place-details loading or failing.

---

### Task 1: Photo accent token and photos-first stop popup

**Files:** src/styles/theme.css (add `--accent-photo: var(--color-dusk-700)`, `--accent-photo-hover: var(--color-dusk-600)` with a comment superseding the "logo only" note for photo actions, `--on-accent-photo: #ffffff`, same in both dark blocks, choosing the dark value by axe), src/themes/chronicle/chronicle.css (`.chronicle-photo-add-btn--primary` full-width pill; `.chronicle-photo-empty` dashed box), src/features/photos/StopPhotoButton.tsx (optional `variant: 'primary' | 'compact'`, label "Add photos" with camera icon for primary; keep aria-label "Add photo to {stop}"), src/features/trip/place/PlaceDetailPanel.tsx, tests.

- [ ] Move the photo block to directly under the title/category, OUTSIDE the `showBody` gate, so it renders while details load or fail. Order: primary Add photos pill → strip (or empty state "No photos yet — add the first one") → existing action row → details. Match design sections 1 and 2.
- [ ] Tests: photo block renders while `loading` is true and when `error` is set; it comes before the details in DOM order; the empty state shows with zero photos; demo trips show photos but no Add button.
- [ ] Screenshot 390 light/dark against design sections 1-2; axe clean.

### Task 2: Header split button and "Which stop?" sheet

**Files:** src/features/trip/components/TripExport.tsx (or a new `TripHeaderActions.tsx` wrapping it), src/features/trip/pages/TripPlanPage.tsx, src/features/photos/ChooseStopSheet.tsx (new), chronicle.css, tests.

- [ ] Replace the loose Print / PDF button with one joined pill: [Print / PDF | Add photos], Add photos in the photo accent (design sections 3-4). Keep the .ics button and hint if present. At ≤ 600px the group goes full width under date/length.
- [ ] Add photos opens `ChooseStopSheet`: a labelled radio list of stops with an id (selected day first, then other days), default the first stop of the selected day, then a "Choose photo" button that opens the file picker and uploads through `useTripPhotos().upload(stopId, file)`. Hidden on demo trips.
- [ ] Tests: split group renders both buttons; choosing a stop and a file calls upload with that stop id; no Add photos on demo trips; the sheet traps focus and closes on Escape.
- [ ] Screenshots 1280 + 390 light/dark vs design; axe clean.

### Task 3: Email-code sign-in (server)

**Files:** d1/migrations/0007_invites_codes.sql (tables `email_codes` and `trip_invites`, `trip_members`, see Task 4 for the latter two), scripts/verify-schema.mjs, functions/lib/auth/emailCode.ts (+test), functions/api/auth/code/request.ts, functions/api/auth/code/verify.ts (+tests), functions/lib/email.ts (`signInCodeHtml(code)` template), functions/lib/db.ts helpers.

`email_codes(id text pk, email text not null, code_hash text not null, expires_at integer not null, attempts integer not null default 0, used_at integer, created_at integer not null)` with an index on email.

- [ ] `POST /api/auth/code/request {email}` must be built to validate the email with Zod; limits `auth-code-request` 10/h per IP and max 5 codes per email per hour (count rows); deletes earlier unused codes for that email; stores the hash; emails the code ("Your Trip One sign-in code is 123456. It expires in 10 minutes."). Always `{ok:true}`.
- [ ] `POST /api/auth/code/verify {email, code}`: limit `auth-code-verify` 30/h per IP. Finds the newest unused, unexpired code for the email; if attempts ≥ 5 → 400 generic; compare hashes in constant time; wrong → attempts+1, 400 "That code didn't work. Check it or request a new one."; right → the endpoint must be the only path that marks the code used, finds or creates the user (create: random unusable password hash via the existing password helper on a 32-byte random secret that is discarded; `email_verified = 1`; display name from the email's local part), mark email verified if not, set the session cookie exactly like login, return `{user}`.
- [ ] Tests: wrong code increments attempts; 6th attempt fails even with the right code; expired code fails; code for email A rejected for email B; success creates a user once and reuses on second sign-in; response shape identical for known and unknown emails on request.

### Task 4: Invites and join (server)

**Files:** 0007 migration (same file as Task 3): `trip_invites(id text pk, trip_id text not null references trips(id), email text not null, created_at integer not null, accepted_user_id text, accepted_at integer, revoked_at integer, unique(trip_id, email))`, `trip_members(trip_id text not null references trips(id), user_id text not null references users(id), role text not null default 'contributor', created_at integer not null, primary key (trip_id, user_id))`. functions/api/trips/[id]/invites/index.ts (GET list, POST create), functions/api/trips/[id]/invites/[inviteId].ts (DELETE revoke), functions/api/recap/[token]/join.ts (POST), email template `tripInviteHtml({tripName, recapUrl})`, trip DELETE cleanup of invites and members, tests.

- [ ] POST invite `{email}`: trip exists, not demo, limit `trip-invites` 30/h; normalize email (trim, lowercase); upsert (un-revoke if revoked); ensure an active recap link (reuse the existing get-or-create); email the invitee a link to `/recap/<token>?invite=1` ("{Trip} — you're invited to add your photos"). Response `{invite: {id, email, createdAt, acceptedAt}}`.
- [ ] GET lists non-revoked invites for the trip; DELETE revokes.
- [ ] POST `/api/recap/:token/join`: token valid and active (same 404 as recap GET otherwise); requires `getAuthedUser`, else 401 `{error:"Sign in first"}`; user must have `emailVerified`; a non-revoked invite for (link.trip_id, user.email) must exist, else 403 "This email isn't invited to this trip."; on success insert `trip_members` (idempotent), set invite accepted fields, return `{tripId}` with `Cache-Control: private, no-store`. The trip id appears ONLY in this success response.
- [ ] Tests: each 401/403/404 path; revoked invite → 403; case-insensitive email match; success idempotent; 403 body never contains the trip id; trip DELETE removes invites and members.

### Task 5: Owner invite UI in Share recap

**Files:** src/features/recap/ShareRecap.tsx (or new `InvitePeople.tsx` rendered beside it on the owner recap), src/features/recap/invitesApi.ts, chronicle.css, tests.

- [ ] Under Share recap: "Invite people to add photos" — labelled email input + "Send invite" (photo accent) + a list of invited emails with status (Invited / Joined) and a Remove button (inline confirm, no window.confirm). Server error text surfaced; success announced in a `role="status"`.
- [ ] Tests: sending posts the normalized email and lists it; remove revokes; errors shown; hidden on demo trips.

### Task 6: Recap banner and the 3-step gate

**Files:** src/features/recap/RecapPublicPage.tsx, src/features/recap/AddPhotosBanner.tsx, src/features/recap/JoinTripSheet.tsx, src/features/auth/AuthContext.tsx (add `requestCode(email)` and `verifyCode(email, code)`), chronicle.css, tests.

- [ ] Banner under the recap header (design section 5): "Were you on this trip?" / "Add your photos to this trip so everyone can see how it went." / photo-accent "Add photos". The banner must only appear on the public recap.
- [ ] The button must be wired to call join directly when the viewer is signed in with a verified email; else open `JoinTripSheet` (design sections 6-8): step 1 email + Continue (requestCode), "Create an account" secondary (same code path, copy explains a new account is created), "Sign in with a password instead" → `/login` with `state.from = /recap/<token>?join=1`; step 2 six single-digit inputs (paste fills all, auto-advance, backspace moves back, `inputMode="numeric"`, `autocomplete="one-time-code"`), "We sent a code to b•••@example.com" (mask all but first char of local part), resend link (cooldown 30 s); step 3 "You're on this trip" + "Go to the trip and add photos" → navigate to `/trip/<tripId>/plan`.
- [ ] Returning from /login with `?join=1` auto-runs join once signed in. 403 shows "This email isn't invited to this trip. Ask the trip owner to invite <email>." with a sign-out-and-try-another-email link.
- [ ] `?invite=1` in the URL opens the sheet automatically.
- [ ] Tests: each step, paste/auto-advance, 403 message, signed-in shortcut, ?join=1 resume, focus management between steps.
- [ ] Screenshots 390 light/dark vs design sections 5-8; axe clean.

### Task 7: Ship v20.0.0

- [ ] Extend scripts/regression-recap.mjs; it must be able to fail on each of these: the photo block is the first section in the stop popup and is visible before details load; the header split button is present; the public recap shows the banner; POST join without sign-in returns 401; the gate sheet opens at step 1. The regression script does NOT send invite or code emails (it would email real third-party addresses, and the server must not special-case tests); those paths are covered by unit tests, and that gap is recorded in the release notes.
- [ ] Apply migration 0007 to remote D1 (Time Travel bookmark + backup first), verify schema, PR, CI, merge, deploy, asset-hash check, regression on prod, screenshots at 375/768/1280 light/dark, version 20.0.0, CHANGELOG, tags, backup branch, GitHub Release.

## Appendix: owner requests, verbatim

> the + photos is at the very bottom of the popup page it needs to be AT THE TOP and with a different color button and in the header of your trip next to print pdf in a professional design component

> the trip recap also doesn't have a the ability to go to the trip to add photos prompt with a login to your account or have them create an account if they didn't and verify their trip link or email or other details so they can then add photos

> option a and all the designs on it are good ( the 8 sub parts) implement that and cancel the grok build work
