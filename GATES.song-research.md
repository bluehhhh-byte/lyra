# Gates: grounded song research and appearance matching

OWNS: lib/admin/song-appearance-suggest.js, lib/admin/song-meta.js, lib/song-research.test.mjs, lib/song-appearance-admin.test.mjs, app/api/admin/appearances.js, app/api/admin/songs.js, app/admin/form.js, app/admin/song-tools.js, app/admin/song-appearance-draft.js, data/song-appearances.json, songs/l-arc-en-ciel-浸食-lose-control.md, scripts/verify-lose-control-appearance.mjs

Scope: Generate source-backed song comments and structured screen-appearance data from one research result, surface lookup failures, and correct the Lose Control/Godzilla record.

- [x] G1: one grounded research result supplies both a careful comment and verified structured appearance, while unsupported claims are rejected
  CHECK: node lib/song-research.test.mjs
  EXPECT: grounded song research tests passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=24d7b6671bf5/38 entries; output={"level":"info","msg":"gemini_call","model":"gemini-flash-latest","at":"2026-08-31T21:45:52.736Z","durationMs":1,"attempt":1,"outcome":"success","status":200} | grounded song research tests passed

- [x] G2: the add-song UI passes the generated comment as a search hint and distinguishes lookup failure from a genuine empty result
  CHECK: node lib/song-appearance-admin.test.mjs
  EXPECT: song appearance admin integration ok
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=24d7b6671bf5/38 entries; output=song appearance admin integration ok

- [x] G3: Lose Control is recorded as Godzilla's verified insert song with an explicit web source and an evidence-aligned comment
  CHECK: node scripts/verify-lose-control-appearance.mjs
  EXPECT: Lose Control appearance verification passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=24d7b6671bf5/38 entries; output=Lose Control appearance verification passed

- [x] G4: all repository regression tests pass
  CHECK: pnpm test
  EXPECT: 전체 156개 통과
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=24d7b6671bf5/38 entries; output=전체 156개 통과 | $ node scripts/run-tests.mjs

- [ ] G5: production serves the corrected Lose Control comment and Godzilla appearance
  CHECK: node scripts/verify-lose-control-appearance.mjs --production
  EXPECT: production Lose Control appearance verification passed
  EVIDENCE: pending
