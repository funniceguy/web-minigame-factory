# Release Checklist (Final Gate)

Use this checklist with `run_release_gate.mjs`.

## Critical checks (must pass)

1. Registry sync
- `npm run sync:games`

2. Leaderboard reflection coverage
- `node skills/leaderboard-reflection-hardening/scripts/audit_leaderboard_reflection.mjs`

3. Achievement coverage
- `node skills/prelaunch-achievement-content-pass/scripts/audit_achievement_coverage.mjs`

4. Syntax sanity
- `node --check src/platform/GameHub.js`
- `node --check src/platform/AchievementSystem.js`

## Optional checks (recommended before production rollout)

1. Leaderboard API local probe
- `npm run check:leaderboard`

2. Remote deploy integrity
- `npm run check:remote`

## Evidence to keep in release note

1. Command outputs for all critical checks.
2. List of touched files related to leaderboard and achievements.
3. Any optional-check warning with explicit owner and follow-up.
4. Final go/no-go.
