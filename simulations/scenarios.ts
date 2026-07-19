/**
 * Scenarios for the planner simulation.
 *
 * Chosen to span the axes the planner actually has to cope with: dense city vs
 * rural town vs vague region, food-led vs activity-led vs sightseeing-led, and
 * domestic vs foreign. A fix that only helps northern Minnesota isn't a fix,
 * so every change is measured against all of these.
 */

export interface Scenario {
  /** Stable id used in the report and in baseline/after comparisons. */
  id: string
  /** The free-text request exactly as a traveler would type it on the homepage. */
  request: string
  /** What the traveler is actually here for — used by the relevance judge. */
  theme: string
  /**
   * Whether food is genuinely the point of the trip. Food-led trips are the
   * control group: a fix that suppresses restaurants everywhere would break
   * these, and that must show up as a regression rather than pass silently.
   */
  foodLed: boolean
}

/**
 * Held-out scenarios: destinations and themes the fix was NOT developed
 * against. The tuned set below is worth less as evidence than these — passing
 * the cases you iterated on partly measures how well you tuned to them. These
 * cover the same axes (region vs town, activity vs food, domestic vs foreign)
 * with places nobody looked at while writing the code.
 */
export const HELD_OUT: Scenario[] = [
  {
    id: 'ericeira-surf',
    request: '5 day surf trip in Ericeira Portugal',
    theme: 'surfing — breaks, board rental and lessons',
    foodLed: false,
  },
  {
    id: 'cozumel-diving',
    request: '4 days scuba diving in Cozumel Mexico',
    theme: 'scuba diving on the reefs',
    foodLed: false,
  },
  {
    id: 'hudson-valley-region',
    request: '3 days antiquing and hiking in the Hudson Valley',
    theme: 'antique shops, flea markets and hiking',
    foodLed: false,
  },
  {
    id: 'scottish-highlands-golf',
    request: 'a golf trip to the Scottish Highlands',
    theme: 'playing links golf courses',
    foodLed: false,
  },
  {
    id: 'detroit-techno',
    request: '3 days in Detroit for techno clubs and record shops',
    theme: 'techno clubs and record shops',
    foodLed: false,
  },
  {
    id: 'oaxaca-food',
    request: '4 days in Oaxaca Mexico eating mole and street food',
    theme: 'mole, markets and street food',
    foodLed: true,
  },
]

export const SCENARIOS: Scenario[] = [
  {
    id: 'intl-falls-fishing-hunting',
    request: 'plan a walleye fishing and ruffed grouse hunting trip in International Falls Minnesota',
    theme: 'walleye fishing and ruffed grouse hunting',
    foodLed: false,
  },
  {
    id: 'northern-mn-region',
    request: 'plan a walleye fishing and ruffed grouse hunting trip in northern Minnesota',
    theme: 'walleye fishing and ruffed grouse hunting',
    foodLed: false,
  },
  {
    id: 'moab-biking',
    request: '4 day mountain biking and canyoneering trip in Moab Utah',
    theme: 'mountain biking and canyoneering',
    foodLed: false,
  },
  {
    id: 'chamonix-hiking',
    request: '5 days hiking and alpine climbing in Chamonix France',
    theme: 'hiking and alpine climbing in the mountains',
    foodLed: false,
  },
  {
    id: 'kyoto-temples',
    request: '5 day trip to Kyoto Japan to see temples and gardens',
    theme: 'temples, shrines and gardens',
    foodLed: false,
  },
  {
    id: 'san-diego-family',
    request: 'a fun 4-day San Diego trip with kids',
    theme: 'family-friendly attractions, beaches and zoos with kids',
    foodLed: false,
  },
  {
    id: 'nashville-music',
    request: '3 days in Nashville for live music and honky tonks',
    theme: 'live music venues and honky tonks',
    foodLed: false,
  },
  {
    id: 'napa-wine-food',
    request: '3 day wine tasting and fine dining trip in Napa Valley',
    theme: 'wine tasting and fine dining',
    foodLed: true,
  },
  {
    id: 'nola-food',
    request: '3 days in New Orleans eating everything — best restaurants and food tours',
    theme: 'restaurants, food tours and eating',
    foodLed: true,
  },
]

/**
 * The v2 sweep: 30 scenarios on destinations none of the earlier work touched.
 *
 * Weighted deliberately toward the failure modes real QA found on production
 * rather than toward cases the planner already handles:
 *
 *  - FAMILY trips (10) — a saloon reached day 4 of a family ski trip because
 *    Places labels bars as `restaurant`. Every family scenario is an audience
 *    trap.
 *  - ADULT / occasion trips (6) — the mirror failure: a zoo on a 21st.
 *  - SMALL BASES (7) — towns whose venues run out mid-trip, which is what sent
 *    a Jackson plan across the Idaho border for coffee.
 *  - LONG trips of 10+ days (5) — where thin and empty days appear.
 *  - NO STATED INTEREST (4) — the empty-intent bug class that shipped in
 *    v11.0.0; a request naming only a party and an occasion must still plan.
 *  - FOOD-LED controls (4) — these must NOT regress when food gets suppressed
 *    elsewhere. Overlaps other axes by design.
 */
export const SWEEP_V2: Scenario[] = [
  // --- family trips: audience traps ---
  { id: 'v2-breck-family-ski', request: '6 day family ski trip in Breckenridge Colorado with two kids', theme: 'family skiing and kid-friendly winter activities', foodLed: false },
  { id: 'v2-orlando-family', request: '5 days in Orlando with kids aged 6 and 9', theme: 'theme parks and family attractions', foodLed: false },
  { id: 'v2-gatlinburg-family', request: '4 day family trip to Gatlinburg Tennessee with young children', theme: 'family attractions and gentle outdoors', foodLed: false },
  { id: 'v2-sandiego-zoo-family', request: '5 days in Carlsbad California with our three kids', theme: 'family attractions and beaches', foodLed: false },
  { id: 'v2-banff-family', request: '7 day family trip to Banff Canada with kids', theme: 'family-friendly mountain activities', foodLed: false },
  { id: 'v2-cornwall-family', request: '6 days in St Ives Cornwall with two small children', theme: 'beaches and family days out', foodLed: false },
  { id: 'v2-lapland-family', request: '5 day family trip to Rovaniemi Finland with kids in winter', theme: 'snow activities and family winter attractions', foodLed: false },
  { id: 'v2-whistler-family', request: '7 day family ski holiday in Whistler with kids', theme: 'family skiing and winter activities', foodLed: false },
  { id: 'v2-myrtle-family', request: '5 days in Myrtle Beach with the kids', theme: 'beach and family attractions', foodLed: false },
  { id: 'v2-taupo-family', request: '6 day family trip to Taupo New Zealand with children', theme: 'family outdoor activities and lakes', foodLed: false },

  // --- adult / occasion trips: the mirror audience trap ---
  { id: 'v2-prague-stag', request: '4 day stag do in Prague for a group of guys', theme: 'bars, beer and nightlife', foodLed: false },
  { id: 'v2-nashville-bach', request: '3 day bachelorette party in Nashville', theme: 'nightlife, bars and live music', foodLed: false },
  { id: 'v2-vegas-40th', request: '4 days in Las Vegas for my 40th birthday with friends', theme: 'nightlife, shows and bars', foodLed: false },
  { id: 'v2-edinburgh-whisky', request: '5 day whisky trip to Edinburgh for two brothers', theme: 'whisky distilleries, bars and pubs', foodLed: false },
  { id: 'v2-munich-beer', request: '4 days in Munich for beer halls and breweries', theme: 'beer halls, breweries and drinking culture', foodLed: false },
  { id: 'v2-mendoza-wine', request: '5 day wine trip to Mendoza Argentina for a couple', theme: 'wineries and wine tasting', foodLed: true },

  // --- small bases: venue exhaustion and out-of-region drift ---
  { id: 'v2-ouray-hiking', request: '5 day hiking trip in Ouray Colorado', theme: 'mountain hiking and hot springs', foodLed: false },
  { id: 'v2-lubec-maine', request: '4 days in Lubec Maine on the coast', theme: 'coastal walks, lighthouses and quiet nature', foodLed: false },
  { id: 'v2-tofino-surf', request: '5 day surf trip to Tofino British Columbia', theme: 'surfing and rainforest coast', foodLed: false },
  { id: 'v2-hallstatt-austria', request: '4 days in Hallstatt Austria', theme: 'alpine lake village sightseeing', foodLed: false },
  { id: 'v2-marfa-texas', request: '4 days in Marfa Texas for art and desert', theme: 'contemporary art installations and desert landscape', foodLed: false },
  { id: 'v2-isle-skye', request: '6 day trip to Portree Isle of Skye for landscape photography', theme: 'dramatic landscape and photography spots', foodLed: false },
  { id: 'v2-bardstown-bourbon', request: '4 day bourbon trip to Bardstown Kentucky', theme: 'bourbon distilleries and tastings', foodLed: false },

  // --- long trips: thin and empty days ---
  { id: 'v2-lisbon-14', request: '14 day trip to Lisbon Portugal', theme: 'city sightseeing, neighbourhoods and viewpoints', foodLed: false },
  { id: 'v2-hokkaido-12', request: '12 day trip around Sapporo Japan', theme: 'city sightseeing, nature and local culture', foodLed: false },
  { id: 'v2-marrakech-10', request: '10 days in Marrakech Morocco', theme: 'souks, palaces, gardens and local culture', foodLed: false },
  { id: 'v2-queenstown-11', request: '11 day adventure trip in Queenstown New Zealand', theme: 'adventure sports and mountain scenery', foodLed: false },
  { id: 'v2-sicily-13', request: '13 days in Palermo Sicily', theme: 'historic sights, markets and coastline', foodLed: false },

  // --- no stated interest: the empty-intent class that shipped broken ---
  { id: 'v2-porto-noint', request: '8 day trip to Porto Portugal for a mother and daughter', theme: "the destination's best-known highlights", foodLed: false },
  { id: 'v2-seville-noint', request: '6 days in Seville Spain for our 10th anniversary', theme: "the destination's best-known highlights, romantic", foodLed: false },
]

/** Every scenario in the v2 sweep plus the original held-out set. */
export const ALL_SCENARIOS: Scenario[] = [...SWEEP_V2, ...HELD_OUT]
