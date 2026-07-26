# Viator Partner API findings (Task A)

Task A is **destination-anchored**, not free-text. Free-text ranking is not
geographic: live-tested "canoe trips near Ely, Minnesota" returned Juneau,
Alaska and Finnish Lapland; "Jackson, Wyoming" returned a Percy Jackson tour in
Rome. The build therefore anchors on `/destinations` + nearest `center`, then
`POST /products/search` with `filtering.destination`.

**Note on doc access:** `docs.viator.com` returns **403** to plain HTTP
fetchers. Claims below that were already verified in a real browser (Task A
spec section "Verified API facts", 2026-07-25) are marked **SPEC-VERIFIED**.
Items this agent could not re-open are marked **UNCONFIRMED** rather than
guessed. Do not treat legacy v1 docs at
`docs.viator.com/partner-api/affiliate/technical/` as authoritative for v2
(`/search/products`, `/taxonomy/destinations` are v1 and do not exist in v2).

Primary source URL (human browser): [Viator Partner API technical docs](https://docs.viator.com/partner-api/technical/).

---

## Access tier (Basic Access Affiliate)

| Endpoint | Basic Access | Role in Task A | Status |
| --- | --- | --- | --- |
| `GET /destinations` | available | Taxonomy + `center` for nearest match | SPEC-VERIFIED |
| `POST /products/search` | available | Destination-filtered product list | SPEC-VERIFIED |
| `GET /products/{product-code}` | available | Logistics / location refs + productUrl | SPEC-VERIFIED |
| `POST /locations/bulk` | available | Resolve `LOC-…` refs to lat/lng | SPEC-VERIFIED |
| `POST /search/freetext` | available | **Not used** as primary path (geo-unsafe) | SPEC-VERIFIED availability; rejected by design |
| `POST /products/bulk`, `/products/modified-since` | NOT available | Do not use at Basic Access | SPEC-VERIFIED |
| `/availability/check`, `/reviews/product` | NOT available | Out of scope | SPEC-VERIFIED |

Source (access matrix): [Access to endpoints](https://docs.viator.com/partner-api/technical/#section/Access-to-endpoints) — SPEC-VERIFIED in browser; re-fetch UNCONFIRMED (403).

---

## Auth and required headers

| Item | Value | Status |
| --- | --- | --- |
| Auth header | `exp-api-key: <key>` | SPEC-VERIFIED |
| Accept | `application/json;version=2.0` (mandatory; omit → 400) | SPEC-VERIFIED |
| Language | `Accept-Language: en-US` | SPEC-VERIFIED |
| Production base | `https://api.viator.com/partner` | SPEC-VERIFIED |
| Sandbox base | `https://api.sandbox.viator.com/partner` | SPEC-VERIFIED |

Source: [Authentication](https://docs.viator.com/partner-api/technical/#section/Authentication/API-key),
[API versioning](https://docs.viator.com/partner-api/technical/#section/Localization/API-versioning-strategy).

---

## Destination taxonomy: `GET /destinations`

Each entry (SPEC-VERIFIED shape):

```json
{
  "destinationId": 34198,
  "name": "Seminyak",
  "type": "CITY",
  "parentDestinationId": 98,
  "lookupId": "2.15.98.34198",
  "defaultCurrencyCode": "IDR",
  "timeZone": "Asia/Makassar",
  "center": { "latitude": -8.68877, "longitude": 115.161267 }
}
```

`center` is the key to destination-anchoring. Implementation:

1. Cache the full list in D1 (`viator_destinations_cache`), refresh monthly.
2. Nearest destination by haversine (`distanceKm` from `functions/lib/places.ts`).
3. If nearest is farther than `VIATOR_MAX_DESTINATION_KM` (60) → empty list.
4. Prefer `type: "CITY"` when distances are within a small band of the nearest.

---

## Product search: `POST /products/search`

SPEC-VERIFIED request shape:

```json
{
  "filtering": {
    "destination": "732",
    "tags": [],
    "flags": [],
    "lowestPrice": 5,
    "highestPrice": 500,
    "startDate": "2023-01-30",
    "endDate": "2023-02-28",
    "includeAutomaticTranslations": true
  },
  "sorting": { "sort": "TRAVELER_RATING", "order": "DESCENDING" },
  "pagination": { "start": 1, "count": 5 },
  "currency": "USD"
}
```

Response: `{ "products": [ ... ], "totalCount": 14 }`.

Implementation uses `filtering.destination` only (no free-text), sorts by
traveler rating, paginates with `count <= VIATOR_RESULT_LIMIT` (8).

---

## Location refs and coordinates

### Product detail location paths

| Path | Status |
| --- | --- |
| `logistics.start[].location.ref` | Confirmed in prior doc samples for product content; used first |
| `itinerary.activityInfo.location.ref` | Candidate in Task A spec; accepted if present |
| `pointOfInterestLocation.location.ref` | Candidate in Task A spec; accepted if present |

Exact field path re-confirmation: **UNCONFIRMED** this session (docs 403). Code
accepts all three; primary path is `logistics.start[].location.ref`.

### `POST /locations/bulk`

- Request: `{ "locations": ["LOC-…", …] }`, max **500** refs per call.
- Response locations include `reference`, optional `center`, optional address.
- Missing entry → location removed; disregard product.
- Google-provider rows may lack `center` (only `providerReference`) — drop those
  products rather than calling Google Places from this path.

SPEC-VERIFIED max 500 and centre shape; Google-without-center detail
**UNCONFIRMED** this session (prior findings).

**Hard rule:** no coordinates → drop product. **Never** substitute the
destination centre as a pin (fabricated data).

Detail calls are capped at `VIATOR_RESULT_LIMIT`; all refs go into **one** bulk
call (`LOCATION_BATCH_MAX = 500`).

---

## Pricing, duration, flags, booking URL

| ThingToDo field | Viator source | Notes |
| --- | --- | --- |
| `priceFrom` | `pricing.summary.fromPrice` | Omit if absent |
| `currency` | `pricing.currency` | Omit if absent |
| `durationMinutes` | `fixedDurationInMinutes` or **upper** `variableDurationToMinutes` | Never fabricate |
| `freeCancellation` | `flags` contains `FREE_CANCELLATION` | Omit (not `false`) if absent |
| `bookingUrl` | affiliate `productUrl` | Use as returned; do not invent paths |
| `rating` / `numReviews` | `reviews.combinedAverageRating` / `totalReviews` | Omit if absent |
| `productCode` | `productCode` | Required to keep an entry |

Affiliate tracking example from docs (SPEC-VERIFIED pattern):
`?mcid=42383&pid=<PARTNER_ID>&medium=api&api_version=2.0`. Partner id from
`env.VIATOR_PARTNER_ID`. Implementation prefers the API's full `productUrl`
when present (docs say not to modify attribution URLs).

Variable duration on product summaries: **UNCONFIRMED** whether search always
returns it; accepted when present via Zod.

---

## What we deliberately did not build

- Free-text `/search/freetext` as the primary discovery path (geo-unsafe).
- Candidate-pool / planner / UI integration (Task B).
- Booking, availability, reviews endpoints (not Basic Access / out of scope).
- Fabricated coordinates, prices, or durations of any kind.

---

## UNCONFIRMED checklist (not invented)

- Live Basic Access affiliate sample payloads for `/products/search` product
  fields (summary vs detail only for logistics).
- Whether `productUrl` always appears on search vs only on product detail.
- Numeric rate-limit quotas for Basic Access.
- Sandbox vs production behavioral differences beyond host name.
- Full re-read of docs.viator.com this session (HTTP 403 to plain fetchers).
