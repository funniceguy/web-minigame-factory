# Result Bridge Contract

Use this contract for game-to-hub result reflection.

## Required bridge APIs

1. Snapshot function inside iframe:

```js
window.__mgpSnapshot = () => ({
  score: 0,
  level: 1,
  maxCombo: 0,
  comboCount: 0,
  stageClears: 0,
  itemsCollected: 0,
  itemCounts: {},
  duration: 1
});
```

2. Result event on terminal state (game over, clear, bankruptcy):

```js
parent.postMessage({
  source: 'mgp-game',
  type: 'result',
  payload: window.__mgpSnapshot()
}, '*');
```

## Payload fields consumed by platform

- `score`: high score source
- `level`: progression level/stage
- `maxCombo`: best combo in session
- `comboCount`: cumulative combo count in session
- `stageClears`: number of cleared stages in session
- `itemsCollected`: number of collected items in session
- `itemCounts`: per-item counts object, consumed by achievement metrics `item.<itemId>`
- `duration`: session length seconds

## Fallback policy

- Primary path: bridge (`postMessage` + `__mgpSnapshot`)
- Secondary path: dedicated fallback script in `collectSessionFromIframe()`
- Last resort: generic fallback in `GameHub`

Do not rely on generic fallback for production-quality ranking.
