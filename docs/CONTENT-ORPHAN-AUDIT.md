# DB/파일 고아 데이터 감사

2026-08-27에 `node scripts/dump-content.mjs --check`를 실행했다. 이 명령은 파일을 쓰거나 삭제하지 않았다.

- DB: 곡 942, 영화 50, data 13
- DB에만 있는 곡: 5건
  - `green-day-holiday`
  - `lemon-and-soul-gil-hadash-into-the-deep-blue`
  - `노이즈가든-negative`
  - `로우하이로우-풍속계`
  - `실리카겔-manphasickzuck`
- 파일에만 있는 항목: 0건
- 양쪽에 있지만 내용이 다른 항목: 2건
  - `songs/yuuri-the-world-has-ended.md`
  - `data/taste-recs.json`

어느 쪽이 최신인지 이 감사만으로 정할 수 없으므로 동기화하거나 삭제하지 않았다. `--check`는 앞으로도 전체 차이 목록을 생략 없이 출력한다.
