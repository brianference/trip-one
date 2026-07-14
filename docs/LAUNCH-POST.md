# LinkedIn announcement post

_Draft copy for announcing Trip One. Paste into LinkedIn; the horizontal rules
are just section markers for editing and aren't meant to be posted._

---

Seven days from idea to production. I shipped an AI trip planner. It's live, it's free, there's no signup: **https://trip-one.pages.dev**

Describe your trip in one sentence. An AI builds a real, day-by-day itinerary from actual nearby places. Then you refine it by chatting. Add sushi. Find a rooftop bar and a space museum. Make it 9 days. Swap the city for Rome. It re-plans in seconds, tells you what changed, and confirms before anything drastic.

Here's the bet that makes it work: the model never writes a place name. It gets a numbered list of real places (Google Places, Tripadvisor) and can only pick and order them. Anything off the list is dropped — so a bad response degrades to a smaller real plan, never a fake one. No invented restaurants, ratings, or hours. And when you ask for something the list doesn't have, it doesn't fake it and it doesn't refuse. It searches for the real thing.

That combination — a genuinely conversational planner, with hard guardrails so it can't invent — is the thing most "AI travel" tools get wrong. They're either a static prompt-and-pray itinerary or a confident hallucination machine. This is neither.

**The AI, concretely**

💬 Conversational planning is the main interaction, not a gimmick: add or remove stops, change the pace, extend or shorten the trip, swap cities — all in plain language, re-planned from real places
🔎 Ask for any kind of place and it's added: a cuisine (sushi, ramen, vegan), a venue type (rooftop bar, planetarium, night market), or a theme ("moon-related", "hidden gems"). It runs a live nearby search (Google Places, with a Tripadvisor fallback for niche queries), hard-filters the results to your destination's vicinity, and drops the real, genuinely-nearby matches on your map and itinerary — never a famous one from the wrong continent
🧠 Grounded generation: index-only, schema-validated model output with a normalization layer that drops anything ungrounded, so the failure mode is "less," never "wrong"
✨ Every change is reviewable: the assistant lists what it added and confirms before it rebuilds or relocates your trip

**Everything else it does**

📍 Tap any stop for photos, ratings, reviews, hours, and directions, then add it to a specific day
🧭 A map with per-day routes, walking distance and time per day, plus per-day summary chips
🌤️ Real weather — current conditions in the nav, a 5-day forecast, and packing tips for your dates
💱 A built-in currency converter for non-US destinations (type an amount, see the live local total)
🗣️ A phrasebook in 32 languages with real neural text-to-speech, so you can actually hear "where is the bathroom?" in Japanese, Thai, or Arabic instead of guessing at a romanization
📅 Export to your calendar (.ics) or a clean print/PDF
📱 A real mobile app shell: a slim top bar (brand, temperature, live currency), a bottom tab bar, and an edge-to-edge map with the chat one tap away — no account, and your trip is just a shareable link

---

**Tech stack**

- Frontend: React + TypeScript + Vite, Zustand for state, React Router, Leaflet for maps, Zod for validation
- Backend: Cloudflare Pages Functions (serverless, edge), which proxy and cache every third-party API so keys stay server-side and CORS/rate-limit concerns live in one place
- Data: Supabase (Postgres) as a cache and trip store, with per-IP rate limiting on the write and paid endpoints
- AI: OpenAI for the grounded planner and chat, with schema-validated, index-only output and a normalization layer that drops anything ungrounded
- CI/CD: GitHub Actions (typecheck + tests + build on every push) and direct deploys to Cloudflare Pages

**API & data integrations**

- 🧠 OpenAI (`gpt-4o-mini`) — the conversational planner and chat, with schema-validated, index-only (grounded) output so it can only order real places, never invent them
- 🗺️ Google Places — nearby attractions, restaurants and cafes, on-demand text search for any kind of place, plus rich Place Details (photos, reviews, hours, phone)
- 🧳 Tripadvisor — additional nearby points of interest, and a text-search fallback for niche/thematic queries
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
