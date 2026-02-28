# Integration Patterns For New Minigames

Use these patterns when onboarding a new game.

## 1) Score/rank reflection pattern

Required in game iframe:

1. Snapshot function
- `window.__mgpSnapshot = () => ({ ...sessionPayload })`

2. Terminal result event
- `parent.postMessage({ source: 'mgp-game', type: 'result', payload }, '*')`

Fallback path in platform:

- Add dedicated game fallback in `collectSessionFromIframe()` in `src/platform/GameHub.js`.
- Keep generic fallback for emergency only.

## 2) Session payload pattern

Preferred payload keys:

- `score`
- `level`
- `maxCombo`
- `comboCount`
- `stageClears`
- `itemsCollected`
- `itemCounts`
- `duration`

## 3) Achievement pack pattern

Baseline metrics to include for every game:

- `playCount`
- `highScore`
- `totalScore`
- progression metric (`bestStage` or `totalStageClears`)

Recommended:

- `maxCombo` / `totalComboCount`
- `totalItemsCollected`
- `item.<itemId>`

Target size:

- 8 to 12 achievements per game.
