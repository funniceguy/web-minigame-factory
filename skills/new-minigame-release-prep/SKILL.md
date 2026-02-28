---
name: new-minigame-release-prep
description: Prepare a newly added mini game for release by collecting integration patterns, checking score/rank bridge wiring, generating an achievement pack template, and running validation gates. Use when a new game HTML file is added or before shipping a game update.
---

# new-minigame-release-prep

Run this workflow from repo root.

## Scope

Use this skill for one target game at a time.

## Inputs

- `--game` (recommended): html file path, example `src/html/neon_jumpin.html`
- `--game-id`: normalized game id, example `neon-jumpin`

## Workflow

1. Run intake + pattern collection
- `node skills/new-minigame-release-prep/scripts/run_new_minigame_release_prep.mjs --game src/html/<new_game>.html`

2. If bridge is missing
- Follow bridge contract in:
  - `skills/leaderboard-reflection-hardening/references/result-bridge-contract.md`
- Then run:
  - `$leaderboard-reflection-hardening`

3. If achievement pack is missing
- Generate template:
  - `node skills/new-minigame-release-prep/scripts/generate_achievement_pack_template.mjs --game-id <game-id>`
- Paste and tune the pack in `src/platform/AchievementSystem.js`.
- Then run:
  - `$prelaunch-achievement-content-pass`

4. Run final gate
- `$release-readiness-gate`

## Output expectations

- Pattern report file under `skills/new-minigame-release-prep/reports/`.
- Clear PASS/FAIL for:
  - registry inclusion
  - bridge/fallback reflection
  - achievement pack existence
  - baseline gates

## Exit criteria

- Target game appears in `src/html/registry.json`.
- Target game has bridge or dedicated fallback.
- Target game has achievement pack with baseline metrics.
- Release gate passes critical checks.
