# Cloud Auth + Leaderboard Setup

## 1) 설정 파일 입력
`src/config/cloud-config.js`에서 아래 값을 채우고 `enabled: true`로 바꾼다.

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

## 2) Firebase Auth 활성화
Firebase Console > Authentication > Sign-in method

1. Google: `Enable`
2. Apple: `Enable`
3. Authorized domains에 실제 배포 도메인 추가

## 3) Firestore 생성
Firebase Console > Firestore Database

1. Database 생성
2. Production/테스트 모드 선택
3. 리전 선택

사용 컬렉션 구조:

- `leaderboardOverall/{uid}`
- `leaderboardByGame/{gameId}/entries/{uid}`

## 4) 권한 규칙 예시
아래는 "로그인한 사용자만 자신의 문서 쓰기" 기준의 최소 예시다.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leaderboardOverall/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /leaderboardByGame/{gameId}/entries/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 5) Apple 로그인 주의
- Apple Developer에서 Service ID / Redirect URL 설정이 필요하다.
- Firebase Auth의 Apple provider 설정과 도메인이 일치해야 한다.
- 팝업이 막히는 환경은 자동으로 redirect 로그인으로 폴백한다.

## 6) 동작 요약
- 로그인 후 게임 종료 시 해당 게임 하이스코어가 자동 업로드된다.
- 전체 랭킹 점수는 "각 게임 하이스코어 합계"로 계산된다.
- 대시보드에서 전체 랭킹/게임별 랭킹/내 점수/내 순위를 상시 확인할 수 있다.
