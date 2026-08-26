# Neon 일일 백업

`.github/workflows/backup.yml`은 매일 03:17 KST에 `dump-content.mjs`로 곡·영화·허용된 data JSON을 파일로 되돌린다. 변경이 있으면 전체 산출물을 **커밋 하나**로 묶고 `db-backup-YYYY-MM-DD` 태그를 원격 저장소에 남긴다. 파일별 커밋이나 GitHub Contents API는 사용하지 않는다.

백업을 main 브랜치에 push하지 않는 이유는 백업 자체가 production 배포를 일으키지 않게 하기 위해서다. 태그 하나가 그날의 전체 저장소 트리를 가리키므로 `git show db-backup-YYYY-MM-DD:songs/<slug>.md`처럼 복구할 수 있다. 같은 날짜 태그가 이미 있으면 재실행은 새 커밋을 만들지 않는다.

실행 전 저장소 Actions secret에 `DATABASE_URL`이 필요하다. 현재 계정 플래그로 scheduled workflow가 실제 실행되지 않을 수 있으므로, 이 변경은 실행 경로 준비까지이며 첫 성공 실행을 주장하지 않는다.
