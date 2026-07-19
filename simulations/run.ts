/**
 * Simulation entry point: `npm run sim [-- --out <file>] [--only <id>]`
 *
 * Runs every scenario through the real pipeline and prints a comparison table.
 * This makes real, paid API calls, so it is deliberately NOT part of `npm test`
 * and never runs in CI.
 */
import { writeFileSync } from 'node:fs'
import { SCENARIOS, HELD_OUT, SWEEP_V2, ALL_SCENARIOS } from './scenarios'
import { loadKeys } from './loadKeys'
import { runScenario, type ScenarioReport } from './harness'

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const keys = loadKeys()
  const only = argValue('--only')
  const outFile = argValue('--out')
  // --held-out runs the scenarios the fix was not developed against, which is
  // the honest test of whether it generalises rather than fits its own cases.
  // --sweep runs the 30-scenario v2 set (fresh destinations, weighted toward
  // the failure modes real QA found); --all runs it plus the earlier held-out
  // set; --held-out runs only the original held-out scenarios.
  const all = process.argv.includes('--all')
    ? ALL_SCENARIOS
    : process.argv.includes('--sweep')
      ? SWEEP_V2
      : process.argv.includes('--held-out')
        ? HELD_OUT
        : SCENARIOS
  const wanted = new Set((only ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const scenarios = wanted.size > 0 ? all.filter((s) => wanted.has(s.id)) : all
  if (scenarios.length === 0) throw new Error('no scenarios matched')

  const reports: ScenarioReport[] = []
  for (const scenario of scenarios) {
    process.stdout.write(`running ${scenario.id} ... `)
    const report = await runScenario(scenario, keys)
    reports.push(report)
    process.stdout.write(report.error ? `ERROR: ${report.error}\n` : `ok (${report.stops.length} stops)\n`)
  }

  console.log('\n== PLANNER SIMULATION ==\n')
  const rows = reports.map((r) => ({
    scenario: r.id,
    destination: r.destination || '—',
    stops: r.stops.length,
    'food-led': r.foodFocused ? 'yes' : '',
    'pool food': pct(r.poolFoodShare),
    'plan food': pct(r.itineraryFoodShare),
    // A food trip has few non-food stops to score, so the share means nothing there.
    'on-theme': r.foodFocused ? 'n/a' : pct(r.onThemeShare),
    relevance: r.meanRelevance.toFixed(2),
    // Bug detectors: any nonzero value here is a defect, not a score.
    'aud!': (r.audienceViolations ?? []).length || '',
    'far!': (r.farStops ?? []).length || '',
    thin: r.thinDays || '',
    empty: r.emptyDays || '',
    error: r.error ?? '',
  }))
  console.table(rows)

  const ok = reports.filter((r) => !r.error)

  // Defects are reported separately from the quality averages: a mean hides
  // the one trip that put a bar in front of someone's children.
  const withAudience = ok.filter((r) => (r.audienceViolations ?? []).length > 0)
  const withFar = ok.filter((r) => (r.farStops ?? []).length > 0)
  const withEmpty = ok.filter((r) => (r.emptyDays ?? 0) > 0)
  console.log('\n== DEFECTS ==\n')
  console.log(`audience violations: ${withAudience.length}/${ok.length} scenarios`)
  for (const r of withAudience) console.log(`  ${r.id}: ${(r.audienceViolations ?? []).join(', ')}`)
  console.log(`out-of-region stops: ${withFar.length}/${ok.length} scenarios`)
  for (const r of withFar) {
    console.log(`  ${r.id}: ${(r.farStops ?? []).map((f) => `${f.name} (${f.km.toFixed(0)}km)`).join(', ')}`)
  }
  console.log(`empty days: ${withEmpty.length}/${ok.length} scenarios`)
  for (const r of withEmpty) console.log(`  ${r.id}: ${r.emptyDays} empty of ${r.days}`)
  console.log(`thin days (<3 stops): ${ok.reduce((n, r) => n + (r.thinDays ?? 0), 0)} across ${ok.length} scenarios`)
  const summarize = (label: string, group: ScenarioReport[]): void => {
    if (group.length === 0) return
    const mean = (pick: (r: ScenarioReport) => number): string =>
      (group.reduce((sum, r) => sum + pick(r), 0) / group.length).toFixed(3)
    console.log(`\n${label} (${group.length}):`)
    console.log(`  plan food share : ${mean((r) => r.itineraryFoodShare)}`)
    console.log(`  on-theme share  : ${mean((r) => r.onThemeShare)}`)
    console.log(`  mean relevance  : ${mean((r) => r.meanRelevance)}`)
    console.log(`  stops per trip  : ${mean((r) => r.stops.length)}`)
  }
  // Split the groups: food SHOULD dominate a food trip, so averaging the two
  // together would hide both a regression and an improvement.
  summarize('activity-led trips', ok.filter((r) => !r.foodFocused))
  summarize('food-led trips', ok.filter((r) => r.foodFocused))

  for (const r of ok) {
    console.log(`\n--- ${r.id} — ${r.destination} (${r.days}d) — "${r.interests}"${r.foodFocused ? ' [food-led]' : ''}`)
    if (r.queries.length > 0) console.log(`    searched: ${r.queries.join(' | ')}`)
    for (const s of r.stops) {
      console.log(`  ${s.isFood ? '🍽 ' : '   '}${s.themed ? '★' : ' '}[${s.relevance}] ${s.name} (${s.category})`)
    }
  }

  if (outFile) {
    writeFileSync(outFile, JSON.stringify(reports, null, 2))
    console.log(`\nwrote ${outFile}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
