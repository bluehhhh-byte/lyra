# Gates: exhaustive song screen-appearance audit v2

OWNS: GATES.song-appearance-exhaustive.md, scripts/backfill-song-appearances.mjs, scripts/finalize-song-appearance-exhaustive.mjs, scripts/verify-song-appearance-exhaustive.mjs, data/song-appearance-backfill.json, data/song-appearance-curated.json, data/song-appearance-web-screen.json, data/song-appearance-web-verify.json, data/song-appearance-exhaustive.json, data/song-appearances.json, songs/**

Scope: Re-research every authoritative song with independent grounded searches, persist every source-supported movie, drama, and anime use in the song's basic appearance data, sync it to Neon, and verify production with no unreviewed songs.

- [x] G1: all authoritative songs have a completed grounded screening pass, every candidate has a completed song-specific verification/review pass, and no retryable or unreviewed result remains
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --coverage
  EXPECT: exhaustive song appearance coverage passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=42c5c131437d/38 entries; output=exhaustive coverage 955 songs · no retryable results | exhaustive song appearance coverage passed

- [x] G2: every accepted screen appearance has a direct grounded evidence URL, supported work type and role, and an exact song-and-artist match
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --evidence
  EXPECT: exhaustive song appearance evidence passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=42c5c131437d/38 entries; output=grounded exhaustive appearances 37 | exhaustive song appearance evidence passed

- [x] G3: the merged basic appearance dataset preserves existing verified records, contains every newly verified work, and has no duplicate song/work identity
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --dataset
  EXPECT: exhaustive song appearance dataset passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=42c5c131437d/38 entries; output=appearance dataset 75 items | exhaustive song appearance dataset passed

- [x] G4: known positive controls and every song whose existing metadata claims screen use resolve to at least one verified appearance
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --positive-controls
  EXPECT: exhaustive song appearance positive controls passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=42c5c131437d/38 entries; output=positive controls 17 songs | exhaustive song appearance positive controls passed

- [x] G5: completed local appearance data is synchronized to the authoritative Neon content store byte-for-byte
  CHECK: node scripts/migrate-content.mjs --verify
  EXPECT: 검증 완료
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=42c5c131437d/38 entries; output=업로드 제외(생성 산출물·비런타임) 18개: ai-generation-log.json, deezer-backfill-audit.json, instagram-hashtags.json, instagram-ko-translation-audit.json, instagram-lang-audit.json, instagram-published.json, instagram-translation-audit.json, needs-work.jso

- [x] G6: repository tests, data validation, production build, and smoke checks pass after the exhaustive merge
  CHECK: pnpm check
  EXPECT: 전체 40개 통과
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=42c5c131437d/38 entries; output=전체 40개 통과 | $ node scripts/run-tests.mjs && node scripts/lint-data.mjs && next build && node scripts/smoke.mjs

- [x] G7: production serves the deployed appearance data from Neon without fallback and exposes multiple newly found works
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --production
  EXPECT: production exhaustive song appearance verification passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=42c5c131437d/38 entries; output=production probes 3 · new appearances 37 | production exhaustive song appearance verification passed
