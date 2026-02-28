# Leaderboard Backend (Simple + Global)

## Overview

- Backend: `server/leaderboard-server.mjs`
- Storage: local JSON file (`data/leaderboard-store.json`)
- Ranking scope: global across all devices/users connected to this server
- Player key priority: `cloudUid` (if logged in) -> local profile id
- Reset policy: every Monday 09:00 (KST / UTC+9)

## Run

```bash
npm run dev
```

Default:

- host: `0.0.0.0`
- port: `3001`

Optional env:

- `PORT`
- `HOST`

## API

- `GET /api/health`
- `POST /api/leaderboard/sync`
  - body: `{ playerId, nickname, avatar, gameScores }`
- `GET /api/leaderboard/snapshot?playerId=...&gameIds=game1,game2&topLimit=5`
- `GET /api/leaderboard/events` (SSE realtime updates)

## Deployment

- Recommended runtime: `npm run start` (or systemd/pm2 with `node ./server/leaderboard-server.mjs`)
- NGINX reverse proxy (`/api/*` + SSE):
  - see `docs/NGINX_LEADERBOARD_PROXY.md`
  - ready-to-use example file: `deploy/nginx/web-minigame-factory.conf`
- systemd unit example:
  - `deploy/systemd/web-minigame-factory.service`
- API smoke check:

```bash
npm run check:leaderboard
```

Remote target check:

```bash
node ./scripts/check-leaderboard-api.mjs https://your-domain
```

If this returns `non-json response ... <!DOCTYPE ...`, the `/api/*` proxy is not active yet.

## Load Optimization

- In-memory ranking cache by `revision`
  - ranking sort is recomputed only when data actually changes
- Write debounce (`~800ms`)
  - multiple quick updates are batched to one disk write
- SSE push for realtime
  - clients receive update events and refresh only when data changes
- Polling fallback interval in client: 3 minutes
  - keeps traffic low if SSE is interrupted

## Client Fallback

- Client mode is `server-first`.
- If `/api/leaderboard/*` is unavailable (404/timeout/network), it automatically falls back to local backup leaderboard storage.
- UI shows a fallback state message while waiting for server reconnect.
- Server reconnect restores realtime mode automatically.

## Local Gated Run and Deploy Hook Contract

`run-local-play.bat` is gate-driven and accepts an optional target game:

- `run-local-play.bat [<game>] [--no-browser]`

Execution order:

1. New game prep gate (`run_new_minigame_release_prep.mjs`)
2. Release readiness gate (`run_release_gate.mjs`)
3. Deploy entrypoint (`deploy/deploy-prod.bat`)
4. Local server start (`npm.cmd run dev`)

Fail policy: fail-closed. If any stage returns non-zero, deploy/local server startup is blocked.

`deploy/deploy-prod.bat` contract:

- Input: `%1` = target game identifier
- Success: `exit /b 0`
- Failure: `exit /b 1` or higher
- `run-local-play.bat` trusts only this return code
- Execution behavior:
  - If `scripts/deploy/publish-prod.bat` exists, it is used as the primary deploy implementation.
  - Otherwise, fallback deploy copies repo files to `deploy/_out/prod/web-minigame-factory` via `robocopy`.
- Optional env:
  - `DEPLOY_TARGET_DIR` (override fallback copy target)
  - `DEPLOY_REMOTE_CHECK_URL` (run `scripts/check-remote-deploy.mjs` after deploy)
  - `DEPLOY_PROD_FORCE_FAIL=1` (test fail-closed behavior)

`scripts/deploy/publish-prod.bat` remote deploy env:

- `DEPLOY_REMOTE_HOST` (required to enable remote deploy)
- `DEPLOY_REMOTE_USER` (default: `root`)
- `DEPLOY_REMOTE_PORT` (default: `22`)
- `DEPLOY_REMOTE_APP_DIR` (default: `/var/www/web-minigame-factory`)
- `DEPLOY_REMOTE_TMP_DIR` (default: `/tmp`)
- `DEPLOY_RESTART_BACKEND=1` and `DEPLOY_BACKEND_SERVICE`
- `DEPLOY_RELOAD_NGINX=1`

