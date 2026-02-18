# Local Run

## 빠른 실행
- (선택) 카드 갱신: `npm.cmd run sync:games`
- 명령: `run-local-play.bat`
- 동작:
  1. `:3001` LISTEN 중인 기존 프로세스 종료
  2. `npx --yes serve . -l 3001`로 서버 재기동
  3. 기본 브라우저로 `http://localhost:3001` 자동 오픈

## 브라우저 자동 오픈 없이 실행
- 명령: `run-local-play.bat --no-browser`

## 수동 확인
- 접속 URL: `http://localhost:3001`
- 포트 점유 확인(PowerShell):
  - `Get-NetTCPConnection -LocalPort 3001 -State Listen`
