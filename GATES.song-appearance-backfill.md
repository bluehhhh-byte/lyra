# Gates: all-song screen appearance backfill

OWNS: GATES.song-appearance-backfill.md, scripts/backfill-song-appearances.mjs, scripts/verify-song-appearance-backfill.mjs, scripts/smoke.mjs, data/song-appearance-backfill.json, data/song-appearance-curated.json, data/song-appearances.json, songs/**

Scope: Research every authoritative song, persist only source-grounded screen appearances, preserve existing verified records, sync the completed dataset to Neon, and verify production.

- [x] G1: every authoritative song slug has a terminal research result or an explicitly retryable failure in the resumable audit
  CHECK: node scripts/verify-song-appearance-backfill.mjs --coverage
  EXPECT: song appearance coverage verification passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=67823eb2a1b2/38 entries; output=song appearance coverage verification passed

- [x] G2: every newly accepted appearance has an exact grounded evidence URL, valid work type and role, and no duplicate song/work identity
  CHECK: node scripts/verify-song-appearance-backfill.mjs --evidence
  EXPECT: song appearance evidence verification passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=67823eb2a1b2/38 entries; output=verified researched appearances 37 | song appearance evidence verification passed

- [x] G3: existing verified appearance records are preserved and the merged dataset passes repository appearance tests
  CHECK: node scripts/verify-song-appearance-backfill.mjs --dataset
  EXPECT: song appearance dataset verification passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=67823eb2a1b2/38 entries; output=dataset appearances 38 | song appearance dataset verification passed

- [x] G4: the completed local appearance dataset is synchronized to the authoritative Neon store and verifies byte-for-byte
  CHECK: node scripts/migrate-content.mjs --verify
  EXPECT: 검증 완료
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=67823eb2a1b2/38 entries; output=업로드 제외(생성 산출물·비런타임) 15개: ai-generation-log.json, deezer-backfill-audit.json, instagram-hashtags.json, instagram-ko-translation-audit.json, instagram-lang-audit.json, instagram-published.json, instagram-translation-audit.json, needs-work.jso

- [x] G5: repository tests and production build pass after the backfill
  CHECK: pnpm check
  EXPECT: 전체 40개 통과
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=67823eb2a1b2/38 entries; output=전체 40개 통과 | $ node scripts/run-tests.mjs && node scripts/lint-data.mjs && next build && node scripts/smoke.mjs

- [x] G6: production exposes the deployed version and at least one backed-up appearance without falling back from Neon
  CHECK: node scripts/verify-song-appearance-backfill.mjs --production
  EXPECT: production song appearance verification passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=67823eb2a1b2/38 entries; output=production probe 10-feet-第ゼロ感 → 더 퍼스트 슬램덩크 | production song appearance verification passed
