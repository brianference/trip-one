# LinkedIn announcement post

_Draft copy for announcing Trip One. Paste into LinkedIn; the horizontal rules
are just section markers for editing and aren't meant to be posted._

---

I built an AI trip planner that never makes up a place. It's live, it's free, and there's no signup: **https://trip-one.pages.dev**

Most "AI travel planners" hand you a confident itinerary full of restaurants that closed in 2019 or museums that never existed. Trip One takes the opposite bet. You describe your trip in one sentence, and it builds a real, day-by-day plan from actual places — then you refine the whole thing by chatting with it.

The core idea is **grounded generation**: the model never writes a place name. It's handed a numbered list of real places (from Google Places and Tripadvisor) and may only pick and order them by index. Anything outside the list gets dropped. So a bad or hallucinated response degrades to a smaller real plan, never a fake one. No invented restaurants, ratings, hours, or reviews.

The feature I'm proudest of: a **phrasebook in 32 languages with real neural text-to-speech**. Every phrase has a speaker button that pronounces it in the destination's own voice, so you can actually hear "where is the bathroom?" in Japanese, Thai, or Arabic instead of guessing at a romanization. Most apps fall back to the browser's robotic built-in voice, which mangles non-Latin scripts. Trip One serves pre-generated Microsoft Edge neural-TTS clips per phrase, and gracefully falls back to browser speech only if a clip can't load. It's a small thing that makes the app feel genuinely useful the moment you land somewhere.

What else it does:

🗺️ One sentence in, a real day-by-day itinerary out, every stop an actual place nearby
💬 Refine by chat: add food, add coffee, relax a day, move a stop to another day, extend the trip, or switch cities, and it re-plans from real places and confirms before it swaps your trip
📍 Tap any stop for photos, ratings, reviews, hours, and directions, then add it straight to a specific day
🧭 A map with per-day routes, walking distance and time per day, and per-day summary chips
🌤️ Real current weather, a 5-day forecast, and packing tips for your dates
📅 Export to your calendar (.ics) or a clean print/PDF
📱 Mobile-first, no account, your trip is just a shareable link

---

**Tech stack**

- Frontend: React + TypeScript + Vite, Zustand for state, React Router, Leaflet for maps, Zod for validation
- Backend: Cloudflare Pages Functions (serverless, edge), which proxy and cache every third-party API so keys stay server-side and CORS/rate-limit concerns live in one place
- Data: Supabase (Postgres) as a cache and trip store, with per-IP rate limiting on the write and paid endpoints
- AI: OpenAI for the grounded planner and chat, with schema-validated, index-only output and a normalization layer that drops anything ungrounded
- CI/CD: GitHub Actions (typecheck + tests + build on every push) and direct deploys to Cloudflare Pages

**API & data integrations**

- 🗺️ Google Places — nearby attractions, restaurants and cafes, plus rich Place Details (photos, reviews, hours, phone)
- 🧳 Tripadvisor — additional nearby points of interest
- 🌍 OpenStreetMap / Nominatim — geocoding and location autocomplete
- 🌤️ Open-Meteo — current conditions and multi-day forecast
- 💱 Frankfurter — live currency conversion for the destination
- 🗣️ Microsoft Edge neural TTS — the 32-language phrasebook pronunciation audio
- 🧭 CARTO / OpenStreetMap tiles — the base map

Every one of these is called through the backend, never the browser, behind a Supabase cache and rate limits, so the app is fast, keys are never exposed, and third-party costs stay bounded.

---

I built this to sharpen how I think about AI products: where generation helps, where it has to be fenced, and how to design guardrails so the failure mode is "less" instead of "wrong." That question, how you get the upside of generative AI without the liability of it inventing things, is the one I find most interesting right now.

Try it, break it, tell me what's missing: **https://trip-one.pages.dev**
Code: https://github.com/brianference/trip-one

#AI #ProductManagement #GenerativeAI #TravelTech #BuildInPublic
