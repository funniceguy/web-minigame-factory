# Usage Playbook

## A. New html game file just added

1. Run intake:

```bash
node skills/new-minigame-release-prep/scripts/run_new_minigame_release_prep.mjs --game src/html/neon_newgame.html
```

2. If output says achievement pack missing:

```bash
node skills/new-minigame-release-prep/scripts/generate_achievement_pack_template.mjs --game src/html/neon_newgame.html
```

3. Paste the template into `src/platform/AchievementSystem.js` and tune thresholds.

4. Re-run intake command until blocking issues disappear.

## B. Run with game id

```bash
node skills/new-minigame-release-prep/scripts/run_new_minigame_release_prep.mjs --game-id neon-newgame
```

## C. Full release flow (recommended)

1. `$new-minigame-release-prep` for target game
2. `$leaderboard-reflection-hardening`
3. `$prelaunch-achievement-content-pass`
4. `$release-readiness-gate`

## D. Report artifact

Each intake run writes a report:

- `skills/new-minigame-release-prep/reports/<game-id>-<timestamp>.json`

Use this file for PR evidence and release notes.
