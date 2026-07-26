/**
 * Decrypt a D1 backup produced by backup-d1.mjs.
 *
 * Encrypted layout (format v1):
 *   magic(4) "D1E1" | iv(12) | authTag(16) | ciphertext(N)
 * Algorithm: AES-256-GCM, key = 32 bytes from BACKUP_ENCRYPTION_KEY (64 hex chars).
 *
 * Usage:
 *   # Decrypt to stdout (pipe carefully; dump may contain PII):
 *   set BACKUP_ENCRYPTION_KEY=<64-hex>   # Windows PowerShell: $env:BACKUP_ENCRYPTION_KEY="..."
 *   node .github/scripts/restore-d1.mjs path/to/d1-….json.enc
 *
 *   # Decrypt to a local file (gitignored path recommended):
 *   node .github/scripts/restore-d1.mjs path/to/d1-….json.enc path/to/restored.json
 *
 * The key MUST come from the environment (or a process that injects env).
 * Never pass the key as a CLI argument, commit it, or log it.
 *
 * Generate a key once (store in repo secrets AND offline — loss is permanent):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createDecipheriv } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

/** AES-256-GCM IV length in bytes. */
const GCM_IV_BYTES = 12

/** AES-256-GCM auth tag length in bytes. */
const GCM_TAG_BYTES = 16

/** Expected encryption key length: 32 bytes as 64 hex characters. */
const ENCRYPTION_KEY_HEX_LENGTH = 64

/** Magic header for encrypted dump format v1. */
const ENC_MAGIC = Buffer.from('D1E1', 'ascii')

/** Minimum file size: magic + iv + tag (+ at least 1 byte ciphertext). */
const MIN_ENC_BYTES = ENC_MAGIC.length + GCM_IV_BYTES + GCM_TAG_BYTES + 1

/** Exactly 64 hex characters. */
const ENCRYPTION_KEY_HEX_RE = /^[0-9a-fA-F]{64}$/

/**
 * Parses BACKUP_ENCRYPTION_KEY from the environment.
 *
 * @returns {Buffer}
 */
function readEncryptionKey() {
  const hex = process.env.BACKUP_ENCRYPTION_KEY?.trim() ?? ''
  if (!hex) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY is required (64 hex chars). ' +
        'Set it in the environment — never pass the key on the command line.',
    )
  }
  if (!ENCRYPTION_KEY_HEX_RE.test(hex) || hex.length !== ENCRYPTION_KEY_HEX_LENGTH) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY must be exactly ${ENCRYPTION_KEY_HEX_LENGTH} hex characters (32 bytes)`,
    )
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Decrypts a backup-d1.mjs ciphertext buffer to UTF-8 JSON plaintext.
 *
 * @param {Buffer} encrypted
 * @param {Buffer} key 32-byte AES-256 key
 * @returns {Buffer} plaintext UTF-8 JSON
 */
export function decryptDump(encrypted, key) {
  if (!Buffer.isBuffer(encrypted) || encrypted.length < MIN_ENC_BYTES) {
    throw new Error(
      `Encrypted dump is too short (${encrypted?.length ?? 0} bytes) or not a Buffer`,
    )
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('decryptDump requires a 32-byte key buffer')
  }

  const magic = encrypted.subarray(0, ENC_MAGIC.length)
  if (!magic.equals(ENC_MAGIC)) {
    throw new Error(
      `Unknown dump magic (expected D1E1). This file is not a v1 encrypted D1 backup.`,
    )
  }

  let offset = ENC_MAGIC.length
  const iv = encrypted.subarray(offset, offset + GCM_IV_BYTES)
  offset += GCM_IV_BYTES
  const tag = encrypted.subarray(offset, offset + GCM_TAG_BYTES)
  offset += GCM_TAG_BYTES
  const ciphertext = encrypted.subarray(offset)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    // Auth failure or corrupt ciphertext — do not leak crypto details.
    throw new Error(
      'Decryption failed (wrong key or corrupted dump). Auth tag did not verify.',
    )
  }
}

/**
 * CLI entry: decrypt encPath to outPath or stdout.
 * Does not log key material or dump contents.
 *
 * @param {string[]} argv
 */
function main(argv) {
  const encPath = argv[0]
  const outPath = argv[1]

  if (!encPath || encPath === '-h' || encPath === '--help') {
    console.error(`Usage:
  BACKUP_ENCRYPTION_KEY=<64-hex> node .github/scripts/restore-d1.mjs <dump.json.enc> [out.json]

  Key via env only. Never pass the key as a CLI flag.
  Without out.json, plaintext JSON is written to stdout.

  Generate key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
    process.exit(encPath ? 0 : 1)
  }

  const key = readEncryptionKey()
  const encrypted = readFileSync(encPath)
  const plaintext = decryptDump(encrypted, key)

  // Light structural check without dumping contents to logs.
  const asText = plaintext.toString('utf8')
  let parsed
  try {
    parsed = JSON.parse(asText)
  } catch {
    throw new Error('Decrypted payload is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.total_rows !== 'number') {
    throw new Error('Decrypted JSON is missing expected backup fields (total_rows)')
  }

  if (outPath) {
    writeFileSync(outPath, plaintext)
    console.error(
      `Restored ${encPath} -> ${outPath} (${plaintext.length} bytes, total_rows=${parsed.total_rows})`,
    )
  } else {
    // stdout: raw JSON only (no logging of contents to stderr beyond size).
    process.stdout.write(plaintext)
    console.error(
      `Restored ${encPath} to stdout (${plaintext.length} bytes, total_rows=${parsed.total_rows})`,
    )
  }
}

// Only run CLI when executed directly (not when imported for tests).
const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith('restore-d1.mjs') ||
    process.argv[1].endsWith('restore-d1.js'))

if (isDirect) {
  try {
    main(process.argv.slice(2))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`RESTORE FAILED: ${message}`)
    process.exit(1)
  }
}
