---
name: release-readiness-gate
description: Run the final predeploy gate for web-minigame-factory. Use before deployment to execute leaderboard hardening, achievement content pass, and release validation checks in one sequence.
---

# release-readiness-gate

Run this workflow from repo root.

## Mandatory upstream skills

1. Run `$leaderboard-reflection-hardening`.
2. Run `$prelaunch-achievement-content-pass`.

Do not skip these two steps. This gate depends on their outputs.

## Gate execution

1. Run local gate:
- `node skills/release-readiness-gate/scripts/run_release_gate.mjs`

2. Run full gate with API and remote checks when available:
- `node skills/release-readiness-gate/scripts/run_release_gate.mjs --with-api --with-remote`

3. Resolve failures in order
- Critical failures: block deployment.
- Optional failures: document explicit reason in release report.

## Required release report

Include:

1. Leaderboard reflection coverage status.
2. Achievement coverage status.
3. Registry sync status.
4. Syntax check status for `GameHub` and `AchievementSystem`.
5. API and remote check result (if run).
6. Final go/no-go decision with blocking issues.

Read `references/release-checklist.md` before final sign-off.

## Exit criteria

- Gate script returns pass for critical checks.
- No unresolved blocking issues remain.
- Release report is attached with evidence.
