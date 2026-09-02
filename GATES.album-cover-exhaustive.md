# Gates: exhaustive carousel album-cover audit

OWNS: GATES.album-cover-exhaustive.md, scripts/audit-album-covers.mjs, scripts/verify-album-covers.mjs, scripts/audit-song-artwork.mjs, data/album-cover-audit.json, lib/artwork-source.js, lib/artwork-proxy.test.mjs, app/api/artwork/route.js, app/songs/[slug]/lyric-card.js, songs/kenshi-yonezu-地球儀.md, songs/릴보이-david.md

Scope: Audit every canonical carousel song without Gemini, replace missing, broken, or non-image cover references with verified release artwork, preserve exact song identity, synchronize runtime data, and verify production.

- [x] G1: every canonical carousel song has a terminal cover audit result and no unreviewed or retryable item remains
  CHECK: node scripts/verify-album-covers.mjs --coverage
  EXPECT: exhaustive album cover coverage passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=a67c3a9e9416/38 entries; output=album cover coverage 958 songs · no retryable results | exhaustive album cover coverage passed

- [x] G2: every carousel cover resolves successfully as an image and no missing or known placeholder artwork remains
  CHECK: node scripts/verify-album-covers.mjs --images
  EXPECT: exhaustive album cover image verification passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=a67c3a9e9416/38 entries; output=958 live image responses · 74 proxy-required songs | exhaustive album cover image verification passed

- [x] G3: the positive control Kenshi Yonezu - Spinning Globe resolves to its verified official release artwork
  CHECK: node scripts/verify-album-covers.mjs --positive-controls
  EXPECT: album cover positive controls passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=a67c3a9e9416/38 entries; output=Kenshi Yonezu - Spinning Globe official release artwork verified | album cover positive controls passed

- [x] G4: the corrected Spinning Globe release artwork and track identity are synchronized to authoritative Neon data
  CHECK: node scripts/verify-album-covers.mjs --neon
  EXPECT: Neon album cover correction verified
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=a67c3a9e9416/38 entries; output=Neon songs 958 · Spinning Globe official artwork | Neon album cover correction verified

- [x] G5: final 958-song state passes the carousel proxy contract and exhaustive cover verifier
  CHECK: node lib/artwork-proxy.test.mjs && node scripts/verify-album-covers.mjs
  EXPECT: album cover positive controls passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=a67c3a9e9416/38 entries; output=Kenshi Yonezu - Spinning Globe official release artwork verified | album cover positive controls passed

- [x] G6: production serves the repaired cover data without content-store fallback
  CHECK: node scripts/verify-album-covers.mjs --production
  EXPECT: production album cover verification passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\박준성\.antigravity\.Test\lyra; path=a67c3a9e9416/38 entries; output=production proxy probes 3 · deployment dpl_EbHa3vAgFzkXwDdcYS55Dqe7J97n | production album cover verification passed
