/**
 * The longest trip the planner will build.
 *
 * This exists because the ceiling used to be declared separately in each
 * endpoint and they disagreed: intent extraction and venue discovery accepted
 * 30 days, while /api/plan and /api/chat accepted 14. A "15 day scuba diving
 * trip in Thailand" was therefore parsed successfully, had its venues
 * discovered, and then died at /api/plan with a bare 400 "invalid request" —
 * the homepage simply sat on "planning your trip" forever with nothing to show
 * the traveler.
 *
 * Any new endpoint that takes a day count must import this rather than
 * declaring its own number.
 */
export const MAX_TRIP_DAYS = 30
