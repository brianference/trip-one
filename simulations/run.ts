/**
 * Simulation entry point: `npm run sim [-- --out <file>] [--only <id>]`
 *
 * Runs every scenario through the real pipeline and prints a comparison table.
 * This makes real, paid API calls, so it is deliberately NOT part of `npm test`
 * and never runs in CI.
 */
import { writeFileSync } from 'node:fs'
import { SCENARIOS, HELD_OUT } from './scenarios'
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
  const all = process.argv.includes('--held-out') ? HELD_OUT : SCENARIOS
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
    error: r.error ?? '',
  }))
  console.table(rows)

  const ok = reports.filter((r) => !r.error)
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
