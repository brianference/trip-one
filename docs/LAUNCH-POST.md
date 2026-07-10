# LinkedIn announcement post

_Draft copy for announcing Trip One. Paste into LinkedIn; the horizontal rules
are just section markers for editing and aren't meant to be posted._

---

I built an AI trip planner where the AI never makes up a place. It's live, it's free, and there's no signup: **https://trip-one.pages.dev**

Here's the whole loop: you describe your trip in one sentence — "a relaxed 4 days in Lisbon, food and history" — and an AI builds a real, day-by-day itinerary from actual nearby places. Then you **plan the rest by chatting with it**. "Add specialty coffee shops to each day." "Make it 9 days." "Move the museum to day two." "Actually, make it Rome." The assistant re-plans in seconds, tells you what it changed, and confirms before anything drastic.

The part I care most about is how the AI is built. The core idea is **grounded generation**: the model never writes a place name. It's handed a numbered list of real places (from Google Places and Tripadvisor) and may only pick and order them by index. Anything outside the list is dropped. So a bad or hallucinated response degrades to a smaller real plan, never a fake one — no invented restaurants, ratings, hours, or reviews. The chat is fenced the same way: it can't claim it added a kind of place that isn't actually in the nearby list.

That combination — a genuinely conversational planner, with hard guardrails so it can't invent — is the thing most "AI travel" tools get wrong. They're either a static prompt-and-pray itinerary or a confident hallucination machine. This is neither.

**The AI, concretely**

💬 Conversational planning is the main interaction, not a gimmick: add or remove stops, change the pace, extend or shorten the trip, swap cities, add coffee or food — all in plain language, re-planned from real places
🧠 Grounded generation: index-only, schema-validated model output with a normalization layer that drops anything ungrounded, so the failure mode is "less," never "wrong"
✨ Every change is reviewable: the assistant lists what it added and confirms before it rebuilds or relocates your trip

**Everything else it does**

📍 Tap any stop for photos, ratings, reviews, hours, and directions, then add it to a specific day
🧭 A map with per-day routes, walking distance and time per day, plus per-day summary chips
🌤️ Real weather — current conditions in the nav, a 5-day forecast, and packing tips for your dates
💱 A built-in currency converter for non-US destinations (type an amount, see the live local total)
🗣️ A phrasebook in 32 languages with real neural text-to-speech, so you can actually hear "where is the bathroom?" in Japanese, Thai, or Arabic instead of guessing at a romanization
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
