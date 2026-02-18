# Minigame Registry

## 현재 카드 소스
- HTML: `src/html/registry.json`
- JSX: `src/jsx/registry.json`
- 런타임 로더: `src/platform/GameHub.js`

## 동기화 명령
- `npm.cmd run sync:games`
- 동작:
  1. `src/html/*.html` 스캔
  2. `src/jsx/*.jsx` 스캔 (`MiniGameFrame.jsx`, `*.test.jsx`, `*.spec.jsx`, `_*.jsx` 제외)
  3. 발견 파일 기준으로 각 `registry.json` 재생성

## Registry Entry 필드
- `path`: 파일 경로 (`/src/html/*.html`, `/src/jsx/*.jsx`)
- `enabled`: `false`면 카드 제외
- `hidden`: `true`면 카드 제외
- `order`: 카드 정렬 우선순위 (낮을수록 먼저)
- `sourcePriority`: 같은 `gameId` 충돌 시 우선순위 (높을수록 우선)
- `id`, `name`, `description`, `icon`, `color`, `gradient`: 카드 메타 override
- JSX 전용: `htmlPath` 또는 `html`

## 충돌 해결 규칙
- HTML/JSX에서 같은 `gameId`가 발견되면 `sourcePriority` 높은 소스를 선택한다.
- 우선순위가 같으면 `order` 낮은 항목을 선택한다.
- 그래도 같으면 JSX 소스를 우선한다.
- 최종 카드에는 단일 `source`만 유지되어 `플레이` 버튼 하나로 실행된다.
