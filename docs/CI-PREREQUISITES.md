# CI 복구 준비

계정 플래그로 GitHub Actions 이벤트가 전달되지 않아 이 워크플로를 실제 CI에서 실행했다고 주장하지 않는다. 플래그가 복구되면 다음 한 가지 비밀값을 먼저 설정해야 한다.

- `INSTAGRAM_EXPORT_URL`: Instagram 내보내기 zip을 인증된 러너가 받을 수 있는 만료/비공개 URL. zip 안에는 `your_instagram_activity/media/posts_1.json`이 있어야 한다.

워크플로는 URL이나 원본을 로그·저장소에 기록하지 않고 러너 임시 폴더에서만 압축을 푼다. 이후 `pnpm verify:instagram`을 완화 없이 실행하므로 현재 알려진 134개 원본 불일치도 그대로 실패로 드러난다. 이어 Playwright Chromium을 설치하고 이미 빌드된 앱을 320·360·390·768·1440px, 밝고 어두운 테마에서 검사한다.
