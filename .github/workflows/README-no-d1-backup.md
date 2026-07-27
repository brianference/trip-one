# Do not add a D1 backup workflow here

There is intentionally **no** GitHub Actions job that dumps D1 or uploads a
backup artifact.

This repository is **public**. On a public repo, workflow artifacts are
downloadable by anyone signed into GitHub (and the REST artifacts endpoint
serves them without auth). The `users` table holds `email` and
`password_hash`. An unencrypted dump in CI would publish credential material.

Backups are local-only: `npm run backup` → `scripts/backup-d1.mjs` →
`backups/local/` (gitignored). Credentials stay in `.env`.

Do not re-introduce `.github/workflows/backup.yml` or any artifact upload of
D1 dumps.
