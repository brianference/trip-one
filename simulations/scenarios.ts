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
