# LinkedIn announcement post

_Draft copy for announcing Trip One. Paste into LinkedIn; the horizontal rules
are just section markers for editing and aren't meant to be posted._

---

I built an AI trip planner that never makes up a place. It's live, it's free, and there's no signup: **https://trip-one.pages.dev**

Most "AI travel planners" hand you a confident itinerary full of restaurants that closed in 2019 or museums that never existed. Trip One takes the opposite bet. You describe your trip in one sentence, and it builds a real, day-by-day plan from actual places — then you refine the whole thing by chatting with it.

The core idea is **grounded generation**: the model never writes a place name. It's handed a numbered list of real places (from Google Places and Tripadvisor) and may only pick and order them by index. Anything outside the list gets dropped. So a bad or hallucinated response degrades to a smaller real plan — never a fake one. No invented restaurants, ratings, hours, or reviews.

What it does:

🗺️ One sentence in, a real day-by-day itinerary out — every stop an actual place nearby
💬 Refine by chat: add food, relax a day, move a stop to another day, or change cities — it re-plans from real places and confirms before it swaps your trip
📍 Tap any stop for photos, ratings, reviews, hours, and directions — then add it straight to a specific day
🧭 A map with per-day routes, walking distance and time per day, and per-day summary chips
🌤️ Real current weather, a 5-day forecast, and packing tips for your dates
🗣️ A phrasebook in 32 languages with neural text-to-speech, so you can actually hear the pronunciation
📅 Export to your calendar (.ics) or a clean print/PDF
📱 Mobile-first, works offline of any account — your trip is just a shareable link

Under the hood: React + TypeScript on Cloudflare Pages, serverless Functions proxying every third-party API behind a cached, rate-limited backend, Supabase for storage, and a grounded LLM planner with schema-validated, index-only output. Fully open source.

I built this to sharpen how I think about AI products: where generation helps, where it has to be fenced, and how to design guardrails so the failure mode is "less" instead of "wrong." That question — how do you get the upside of generative AI without the liability of it inventing things — is the one I find most interesting right now.

Try it, break it, tell me what's missing: **https://trip-one.pages.dev**
Code: https://github.com/brianference/trip-one

#AI #ProductManagement #GenerativeAI #TravelTech #BuildInPublic
