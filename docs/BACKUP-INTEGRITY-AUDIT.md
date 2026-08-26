# 백업 SHA-256 무결성 감사

2026-08-27에 `node scripts/dump-content.mjs --verify`를 실행했다. 읽기 전용 경로이며 파일을 쓰거나 삭제하지 않았다.

- DB 대조 대상: 1,005행(곡 942, 영화 50, data 13)
- SHA-256 일치: **998건**
- 불일치: **7건**
  - 파일 없음 5건: `green-day-holiday`, `lemon-and-soul-gil-hadash-into-the-deep-blue`, `노이즈가든-negative`, `로우하이로우-풍속계`, `실리카겔-manphasickzuck`
  - 해시 불일치 2건: `songs/yuuri-the-world-has-ended.md`, `data/taste-recs.json`

기존 코드는 기본 dump가 파일을 쓴 **뒤** SHA-256을 검증하고 있었지만, 덮어쓰기 없이 현재 상태를 해시 대조하는 경로는 없었다. `--verify`를 추가해 문서와 동작 범위를 명확히 맞췄다. 현재 7건은 어느 쪽이 최신인지 결정하지 않았으므로 자동 동기화하지 않았다.
