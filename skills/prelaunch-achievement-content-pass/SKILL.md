---
name: prelaunch-achievement-content-pass
description: Review each game before release and add achievement content based on gameplay actions and cumulative results. Use when a game has weak or missing achievements, when new metrics are added, or as part of final release preparation.
---

# prelaunch-achievement-content-pass

Run this workflow from repo root.

1. Audit current achievement coverage
- Run `node skills/prelaunch-achievement-content-pass/scripts/audit_achievement_coverage.mjs`.
- Treat missing game definitions and weak metric coverage as blocking.

2. Confirm collectible and progression metrics exist
- Ensure each game session captures usable fields:
  - `score`, `level`, `maxCombo`, `comboCount`, `stageClears`, `itemCounts`
- If metrics are missing, first apply `$leaderboard-reflection-hardening`.

3. Expand `AchievementSystem` definitions
- Edit `src/platform/AchievementSystem.js`.
- For each game, add 8-12 achievements with ascending thresholds.
- Cover both gameplay actions and cumulative outcomes:
  - action-driven: `item.<itemId>`, `maxCombo`, `bestStage`
  - cumulative: `playCount`, `totalScore`, `totalStageClears`, `totalItemsCollected`, `totalComboCount`

4. Validate quality gates
- Run:
  - `node skills/prelaunch-achievement-content-pass/scripts/audit_achievement_coverage.mjs`
  - `node --check src/platform/AchievementSystem.js`
- Confirm unlock progress UI still renders in GameHub achievement modal.

Read `references/achievement-design-rubric.md` before adding thresholds.

## Exit criteria

- Every registered game has an achievement pack.
- Every pack has baseline metrics (`playCount`, `highScore`, `totalScore`, progression metric).
- Audit script passes with no blocking findings.
