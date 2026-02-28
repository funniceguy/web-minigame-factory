# Cloud Auth Troubleshooting

## 증상
- 대시보드에 `클라우드 인증 비활성화`가 표시됨
- 랭킹이 갱신되지 않음

## 원인
아래 3개 Firebase 필수 값이 비어 있으면 클라우드가 비활성화된다.
- `apiKey`
- `authDomain`
- `projectId`

## 해결 방법 (코드 수정 없이)
1. 앱에서 `랭킹 탭`으로 이동
2. `클라우드 설정` 버튼 클릭
3. Firebase 값 입력 후 `저장 후 적용`
4. 페이지가 자동 새로고침되면 Google/Apple 로그인 진행

설정은 브라우저 `localStorage`의 `mgp_cloud_config` 키에 저장된다.

## 해결 방법 (파일 기반)
`src/config/cloud-config.js`에 Firebase 값을 입력한다.

```js
export const cloudConfig = {
  enabled: true,
  firebase: {
    apiKey: '...',
    authDomain: '...firebaseapp.com',
    projectId: '...',
    appId: '...'
  }
};
```

## 추가 점검
- Firebase Authentication에서 Google/Apple provider 활성화
- Authorized domains에 현재 도메인 등록
- Firestore rules에서 본인 uid 쓰기 허용
