# Gates: song research provenance v2

OWNS: lib/admin/song-appearance-suggest.js, lib/song-research.test.mjs, lib/song-appearance-suggest.test.mjs, lib/song-appearance-admin.test.mjs, app/admin/form.js, app/admin/song-appearance-draft.js, app/api/admin/appearances.js, app/api/admin/songs.js, app/admin/song-tools.js, app/songs/[slug]/page.js, lib/admin/frontmatter.js, songs/l-arc-en-ciel-浸食-lose-control.md, scripts/verify-lose-control-appearance.mjs

Scope: Reject mismatched or weak appearance evidence, separate lyric-only commentary from web-enriched claims, and preserve visible source provenance through save and regeneration.

- [x] G1: research accepts lyric-only commentary without invented web facts, but web-enriched commentary requires an exact grounded source and conflicting or weak-only appearance evidence is rejected
  CHECK: node lib/song-research.test.mjs
  EXPECT: grounded song research provenance tests passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra\.worktrees\song-research-v2; path=24d7b6671bf5/38 entries; output={"level":"info","msg":"gemini_call","model":"gemini-flash-latest","at":"2026-08-31T22:39:24.567Z","durationMs":0,"attempt":1,"outcome":"success","status":200} | grounded song research provenance tests passed

- [x] G2: comment evidence URLs survive add and regeneration flows and are rendered as inspectable links on the public song page
  CHECK: node lib/song-appearance-admin.test.mjs
  EXPECT: song research provenance integration ok
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra\.worktrees\song-research-v2; path=24d7b6671bf5/38 entries; output=song research provenance integration ok

- [x] G3: all repository regression tests pass
  CHECK: pnpm test
  EXPECT: 전체 156개 통과
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra\.worktrees\song-research-v2; path=24d7b6671bf5/38 entries; output=전체 156개 통과 | $ node scripts/run-tests.mjs

- [ ] G4: production exposes the corrected Lose Control appearance and durable comment evidence links
  CHECK: node scripts/verify-lose-control-appearance.mjs --production
  EXPECT: production Lose Control appearance provenance verification passed
  EVIDENCE: pending
