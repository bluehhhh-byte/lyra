# Gates: official song artwork audit

OWNS: GATES.album-cover.md, songs/**, scripts/audit-song-artwork.mjs, lib/song-artwork.test.mjs

Scope: Every song has a reachable official release cover matched to its title, artist, and album, with an automated regression audit and production verification.

- [x] G1: every song has an HTTPS artwork URL from a verified music catalog and no artwork_none exception remains
  CHECK: node scripts/audit-song-artwork.mjs --local
  EXPECT: local artwork audit passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=24d7b6671bf5/38 entries; output=937 songs · 898 unique covers | local artwork audit passed

- [x] G2: the audit rejects missing, unreachable, and non-catalog artwork through known positive controls
  CHECK: node scripts/audit-song-artwork.mjs --self-test
  EXPECT: artwork audit self-test passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=24d7b6671bf5/38 entries; output=artwork audit self-test passed

- [x] G3: all repository tests pass after artwork corrections
  CHECK: pnpm test
  EXPECT: 전체 155개 통과
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=24d7b6671bf5/38 entries; output=전체 155개 통과 | $ node scripts/run-tests.mjs

- [x] G4: production serves the corrected artwork fields without browser or image request errors
  CHECK: node scripts/audit-song-artwork.mjs --production
  EXPECT: production artwork audit passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=24d7b6671bf5/38 entries; output=11 corrected production pages and images verified | production artwork audit passed
