# Achievement Design Rubric (Prelaunch)

Design achievement packs from gameplay actions and cumulative results.

## Storage-backed metrics

Use metrics already persisted in `StorageManager` game data:

- `playCount`
- `highScore`
- `totalScore`
- `bestLevel`, `bestStage`
- `maxCombo`
- `totalComboCount`
- `totalStageClears`
- `totalItemsCollected`
- `item.<itemId>` via `itemStats`

## Required pillars per game

1. Onboarding
- 1-2 achievements from `playCount` (example: 1, 10)

2. Skill
- 2 achievements from `highScore`
- Optional 1 from `maxCombo`

3. Progression
- 1-2 achievements from `bestStage` or `totalStageClears`

4. Long-term retention
- 1-2 achievements from `totalScore`
- Optional 1 from `totalComboCount`

5. Action/item identity
- 1-2 achievements from item metrics (`item.<itemId>`)
- Optional 1 from `totalItemsCollected`

## Threshold and points policy

- Use ascending thresholds.
- Keep points monotonic with difficulty.
- Suggested points range: 5 to 40.
- Target pack size: 8 to 12 achievements per game.

## Merge checklist

1. Add definitions in `registerDefaultAchievements()`.
2. Keep ids unique within each game.
3. Run `node skills/prelaunch-achievement-content-pass/scripts/audit_achievement_coverage.mjs`.
4. Run `node --check src/platform/AchievementSystem.js`.
