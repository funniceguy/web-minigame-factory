# Integration Protocol (postMessage)

`GameHub`는 활성 게임 iframe으로부터 아래 포맷 메시지를 수신한다.

## Envelope
```js
{
  source: 'mgp-game',
  type: 'result' | 'achievement' | 'runner-ready',
  payload: { ... }
}
```

## `type: "result"`
게임 1판(세션) 결과를 전달한다.

```js
{
  source: 'mgp-game',
  type: 'result',
  payload: {
    score: 12000,
    level: 6,
    maxCombo: 14,
    comboCount: 34,
    stageClears: 3,
    itemsCollected: 8,
    itemCounts: { multiball: 3, shield: 2 },
    duration: 185,
    clearTime: 95
  }
}
```

`GameHub` 처리 순서:
1. `normalizeSessionResult()`
2. `StorageManager.recordGameSession()`
3. `AchievementSystem.checkAndUnlock()`

## `type: "achievement"`
게임 내부에서 특정 업적 ID를 직접 해금 요청할 때 사용한다.

```js
{
  source: 'mgp-game',
  type: 'achievement',
  payload: {
    achievementId: 'nb_score_12000'
  }
}
```

## `type: "runner-ready"`
JSX 러너 준비 완료 신호다. 현재 허브에서 필수 처리는 하지 않지만 디버깅 지표로 사용 가능하다.

## iframe snapshot 규칙
- 게임이 `result`를 보내지 않아도, 허브 종료 시 `__mgpSnapshot()`가 있으면 수집한다.
- `__mgpSnapshot()`이 없으면 게임별 fallback 스크립트로 최소 결과를 평가한다.

## 브리지 권장 구현
- 게임 시작 시 `sent` 플래그 초기화
- 게임 종료/패배/클리어 시 `result` 1회 전송
- `beforeunload`에서 강제 전송
- `window.__mgpSnapshot = () => ({ ...metrics })` 노출
