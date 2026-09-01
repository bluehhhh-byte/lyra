# Gates: exhaustive song screen-appearance audit v2

OWNS: GATES.song-appearance-exhaustive.md, scripts/backfill-song-appearances.mjs, scripts/finalize-song-appearance-exhaustive.mjs, scripts/verify-song-appearance-exhaustive.mjs, data/song-appearance-backfill.json, data/song-appearance-curated.json, data/song-appearance-web-screen.json, data/song-appearance-web-verify.json, data/song-appearance-exhaustive.json, data/song-appearances.json, songs/**

Scope: Re-research every authoritative song with independent grounded searches, persist every source-supported movie, drama, and anime use in the song's basic appearance data, sync it to Neon, and verify production with no unreviewed songs.

- [ ] G1: all authoritative songs have a completed grounded screening pass, every candidate has a completed song-specific verification/review pass, and no retryable or unreviewed result remains
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --coverage
  EXPECT: exhaustive song appearance coverage passed
  EVIDENCE: pending

- [ ] G2: every accepted screen appearance has a direct grounded evidence URL, supported work type and role, and an exact song-and-artist match
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --evidence
  EXPECT: exhaustive song appearance evidence passed
  EVIDENCE: pending

- [ ] G3: the merged basic appearance dataset preserves existing verified records, contains every newly verified work, and has no duplicate song/work identity
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --dataset
  EXPECT: exhaustive song appearance dataset passed
  EVIDENCE: pending

- [ ] G4: known positive controls and every song whose existing metadata claims screen use resolve to at least one verified appearance
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --positive-controls
  EXPECT: exhaustive song appearance positive controls passed
  EVIDENCE: pending

- [ ] G5: completed local appearance data is synchronized to the authoritative Neon content store byte-for-byte
  CHECK: node scripts/migrate-content.mjs --verify
  EXPECT: 검증 완료
  EVIDENCE: pending

- [ ] G6: repository tests, data validation, production build, and smoke checks pass after the exhaustive merge
  CHECK: pnpm check
  EXPECT: 전체 40개 통과
  EVIDENCE: pending

- [ ] G7: production serves the deployed appearance data from Neon without fallback and exposes multiple newly found works
  CHECK: node scripts/verify-song-appearance-exhaustive.mjs --production
  EXPECT: production exhaustive song appearance verification passed
  EVIDENCE: pending
