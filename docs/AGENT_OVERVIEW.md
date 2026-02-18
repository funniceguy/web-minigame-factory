# Agent Overview

## 프로젝트 요약
- 이름: `web-minigame-factory`
- 형태: 정적 웹 앱 (iframe 기반 미니게임 허브)
- 실행:
  - `npm run dev`
  - `run-local-play.bat` (포트 3001 기존 서버 종료 후 재기동)
  - `npm.cmd run sync:games` (html/jsx 폴더 기준 카드 레지스트리 동기화)

## 핵심 엔트리
- `index.html`: 허브 부트스트랩
- `src/platform/GameHub.js`: 카드 UI, 단일 플레이 버튼, 게임 실행, 세션 저장, 팝업 UI
- `src/platform/AchievementSystem.js`: 게임별 업적 정의, 조건 검사, 해금 토스트
- `src/systems/StorageManager.js`: 로컬스토리지 저장/집계 레이어
- `src/platform/jsx-runner.html`: JSX 실행 러너
- `src/jsx/MiniGameFrame.jsx`: JSX에서 HTML 게임 iframe 호스팅/메시지 중계
- `src/html/registry.json`, `src/jsx/registry.json`: 카드 소스 레지스트리

## 현재 UX 규칙
- 게임 카드는 `플레이` 버튼 1개만 사용한다.
- 게임별 실행 소스는 등록된 단일 `source`만 사용한다.
- 카드에 게임별 `플레이 횟수`와 `업적 달성 수`를 표시한다.
- 상단 통계 바에 전체 `플레이 횟수`, 전체 `업적 달성/총개수`를 표시한다.
- `업적`, `프로필`은 팝업 모달로 표시한다.

## 데이터 흐름
1. 사용자가 게임 카드 `플레이` 클릭
2. `GameHub.launchGame()`가 등록된 `source`(html/jsx/module) 단일 실행
3. 게임 종료 시 iframe bridge가 `postMessage(type: "result")` 전송
4. `StorageManager.recordGameSession()`이 플레이/점수/스테이지/콤보/아이템 누적
5. `AchievementSystem.checkAndUnlock()`이 조건을 검사하고 업적 해금
6. 허브 리렌더로 게임별/전체 카운트 갱신

## 저장 키
- 접두사: `mgp_`
- `mgp_profile`: 닉네임/아바타/전체 누적 통계
- `mgp_games`: 게임별 누적 통계
- `mgp_achievements`: 게임별 해금 업적 ID 목록
- `mgp_settings`: 일반 설정

## 게임 데이터 필드 (핵심)
- `playCount`, `highScore`, `totalScore`
- `bestLevel`, `bestStage`, `maxCombo`
- `totalComboCount`, `totalStageClears`
- `totalItemsCollected`, `itemStats`
- `lastSessionScore`, `totalPlayTime`

## 빠른 확인 체크리스트
- 카드별 `플레이 횟수`, `업적 달성 수` 노출
- 상단 통계 바 전체 카운트 노출
- 카드 `업적` 버튼으로 게임별 업적 팝업 표시
- `프로필` 버튼으로 프로필 팝업 표시/닉네임 저장
- 게임 종료 후 카운트와 업적 즉시 반영
