---
name: leaderboard-reflection-hardening
description: Harden leaderboard reflection so every game updates high score and rank correctly. Use when a game play result is not reflected, when adding a new game, or before release to verify bridge and fallback coverage across all games.
---

# leaderboard-reflection-hardening

Run this workflow from repo root.

1. Audit reflection coverage first
- Run `node skills/leaderboard-reflection-hardening/scripts/audit_leaderboard_reflection.mjs`.
- Treat any `FAIL` as blocking.

2. Fix missing result reflection paths
- If a game lacks a bridge, add both:
  - `window.__mgpSnapshot = () => ({ ...payload })`
  - `parent.postMessage({ source: 'mgp-game', type: 'result', payload }, '*')`
- If bridge cannot be added safely, add a dedicated fallback in `collectSessionFromIframe()` inside `src/platform/GameHub.js`.
- Keep generic fallback as a safety net, not as primary coverage.

3. Keep game discovery in sync
- Run `npm.cmd run sync:games`.
- Confirm the new game path exists in `src/html/registry.json`.

4. Validate code and contract
- Run `node --check src/platform/GameHub.js`.
- If HTML bridge code was changed, run:
  - `node -e "import fs from 'node:fs'; const html=fs.readFileSync('src/html/<game>.html','utf8'); const scripts=[...html.matchAll(/<script(?:[^>]*)>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).filter(s=>s.trim()); scripts.forEach((s,i)=>{ new Function(s); });"`

5. Verify runtime behavior manually
- Play the target game once.
- Exit game.
- Confirm:
  - high score is updated
  - leaderboard card rank updates
  - no `Leaderboard API 404` or bridge parsing errors in console

Read `references/result-bridge-contract.md` before editing game bridge code.

## Exit criteria

- Audit script returns pass.
- Every registered game is covered by either bridge or dedicated fallback.
- Manual smoke confirms score and rank reflection for affected games.
