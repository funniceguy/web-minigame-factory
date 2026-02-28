# Local Run

## CLI Contract

- Command: `run-local-play.bat [<game>] [--no-browser]`
- Optional: `<game>` (if omitted, default target is auto-selected from `src/html/registry.json`)
- Optional: `--no-browser`

Allowed `<game>` formats:

1. game id (example: `neon-jumpin`)
2. html file name (example: `neon_jumpin.html`)
3. html path (example: `src/html/neon_jumpin.html`)

## Execution Flow (Fail-Closed)

`run-local-play.bat` now enforces this order:

1. `node skills/new-minigame-release-prep/scripts/run_new_minigame_release_prep.mjs --game <game>`
2. `node skills/release-readiness-gate/scripts/run_release_gate.mjs`
3. `call deploy/deploy-prod.bat "<game>"`
4. Local server startup (`npm.cmd run dev`), health check, browser open (unless `--no-browser`)

If any stage fails, execution stops immediately and local server will not start.

## Examples

- `run-local-play.bat`
- `run-local-play.bat neon-jumpin`
- `run-local-play.bat neon_jumpin.html --no-browser`
- `run-local-play.bat src/html/neon_jumpin.html`

## Deploy Hook Settings

`deploy/deploy-prod.bat` runs before local server startup.

- Custom deploy script priority:
  - if `scripts/deploy/publish-prod.bat` exists, it is called first.
- Default deploy mode (when custom script is missing):
  - source: repo root
  - target: `deploy/_out/prod/web-minigame-factory`
  - copy command: `robocopy` (`/E`, non-destructive)
- Optional env:
  - `DEPLOY_TARGET_DIR`: override default target directory
  - `DEPLOY_REMOTE_CHECK_URL`: run remote smoke check after deploy
  - `DEPLOY_PROD_FORCE_FAIL=1`: force failure for gate test

When `scripts/deploy/publish-prod.bat` is present, you can enable remote deploy with:

- `DEPLOY_REMOTE_HOST` (required for remote copy)
- `DEPLOY_REMOTE_USER` (default: `root`)
- `DEPLOY_REMOTE_PORT` (default: `22`)
- `DEPLOY_REMOTE_APP_DIR` (default: `/var/www/web-minigame-factory`)
- `DEPLOY_REMOTE_TMP_DIR` (default: `/tmp`)
- `DEPLOY_RESTART_BACKEND=1` (optional service restart)
- `DEPLOY_BACKEND_SERVICE` (default: `web-minigame-factory`)
- `DEPLOY_RELOAD_NGINX=1` (optional nginx test/reload)

## Manual Checks

- URL: `http://localhost:3001`
- API health: `http://localhost:3001/api/health`
- API smoke script: `npm run check:leaderboard`
- Port check (PowerShell): `Get-NetTCPConnection -LocalPort 3001 -State Listen`
