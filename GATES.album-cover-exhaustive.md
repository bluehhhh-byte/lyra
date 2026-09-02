# Gates: exhaustive carousel album-cover audit

OWNS: GATES.album-cover-exhaustive.md, scripts/audit-album-covers.mjs, scripts/verify-album-covers.mjs, scripts/audit-song-artwork.mjs, data/album-cover-audit.json, lib/artwork-source.js, lib/artwork-proxy.test.mjs, app/api/artwork/route.js, app/songs/[slug]/lyric-card.js, songs/kenshi-yonezu-地球儀.md

Scope: Audit every canonical carousel song without Gemini, replace missing, broken, or non-image cover references with verified release artwork, preserve exact song identity, synchronize runtime data, and verify production.

- [ ] G1: every canonical carousel song has a terminal cover audit result and no unreviewed or retryable item remains
  CHECK: node scripts/verify-album-covers.mjs --coverage
  EXPECT: exhaustive album cover coverage passed
  EVIDENCE: pending

- [ ] G2: every carousel cover resolves successfully as an image and no missing or known placeholder artwork remains
  CHECK: node scripts/verify-album-covers.mjs --images
  EXPECT: exhaustive album cover image verification passed
  EVIDENCE: pending

- [ ] G3: the positive control Kenshi Yonezu - Spinning Globe resolves to its verified official release artwork
  CHECK: node scripts/verify-album-covers.mjs --positive-controls
  EXPECT: album cover positive controls passed
  EVIDENCE: pending

- [ ] G4: corrected runtime cover data is synchronized to the authoritative Neon content store byte-for-byte
  CHECK: node scripts/migrate-content.mjs --verify
  EXPECT: 검증 완료
  EVIDENCE: pending

- [ ] G5: final 957-song state passes repository tests, data validation, and the exhaustive cover verifier
  CHECK: pnpm test && pnpm lint:data && node scripts/verify-album-covers.mjs
  EXPECT: album cover positive controls passed
  EVIDENCE: pending

- [ ] G6: production serves the repaired cover data without content-store fallback
  CHECK: node scripts/verify-album-covers.mjs --production
  EXPECT: production album cover verification passed
  EVIDENCE: pending
