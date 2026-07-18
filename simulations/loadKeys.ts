import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import type { SimKeys } from './harness'

/**
 * Loads the API keys the simulation needs from the local env files.
 *
 * Values are read straight into the returned object and never logged — the
 * simulation reports place names and ratios, never credentials.
 *
 * The shared workspace env is loaded FIRST and the project-local `.dev.vars`
 * LAST, so a key defined in both resolves to the project's own value rather
 * than silently inheriting the shared one.
 */

const PROJECT_ENV = resolve(process.cwd(), '.dev.vars')

/**
 * Finds the shared workspace env by walking up from the current directory.
 * A fixed relative path would break between a plain checkout and a git
 * worktree, which sit at different depths.
 */
function findSharedEnv(): string {
  let dir = process.cwd()
  for (let i = 0; i < 8; i += 1) {
    const candidate = resolve(dir, 'projects/x-search-mcp-server/.env')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return ''
}

/** Minimal KEY=VALUE parser — enough for these files, no dependency needed. */
function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value !== '') out[key] = value
  }
  return out
}

/**
 * @throws If a required key is missing, naming only the KEY — never a value.
 */
export function loadKeys(): SimKeys {
  const env = { ...parseEnvFile(findSharedEnv()), ...parseEnvFile(PROJECT_ENV), ...process.env }

  const openAi = env.OPENAI_API_KEY
  const googlePlaces = env.GOOGLE_PLACES_API_KEY
  if (!openAi) throw new Error('OPENAI_API_KEY not found in .dev.vars or the shared env')
  if (!googlePlaces) throw new Error('GOOGLE_PLACES_API_KEY not found in .dev.vars or the shared env')

  return { openAi, googlePlaces, tripadvisor: env.Tripadvisor_API_Key ?? env.TRIPADVISOR_API_KEY }
}
