// 인스타그램 내보내기 → 곡 파일 변환 규칙 (순수 함수 — fs·네트워크 없음).
// 스크립트(scripts/instagram-import.mjs)는 파일 입출력만 하고 판단은 전부 여기서 한다.
// 그래야 재실행 안전성(같은 내보내기를 다시 넣어도 아무것도 안 바뀜)을 테스트할 수 있다.
import crypto from "crypto";
import { normText } from "./itunes.js";
import { kstDay } from "../kst.js";

// Meta 내보내기는 UTF-8 바이트를 latin1로 이스케이프한다 — 복구
export const fixMojibake = (s) => Buffer.from(s || "", "latin1").toString("utf8");

// 헤더: `| 아티스트 - 제목 (한국어제목, 연도)` — 괄호는 (연도)만일 수도 있다.
// 보관 게시물 쪽 캡션은 손으로 쓴 변형이 많다. 그대로 두면 제목·slug에 그 쓰레기가
// 영구히 박히므로 여기서 정리한다:
//   `| 1. Miyuna - …`          앞머리 번호
//   `… (2024) * 원곡 : …`      제목 뒤 출처 메모
//   `… (1992}`                 닫는 괄호 오타
function normalizeHeaderLine(line) {
  return line
    .replace(/#\S+/g, "")
    .replace(/[*※].*$/, "")       // 제목 뒤 메모는 헤더가 아니다
    .replace(/^\s*\|?\s*\d+\.\s+/, "| ") // 앞머리 번호 제거 (구분자는 유지)
    .replace(/\}\s*$/, ")")        // (1992} → (1992)
    .trim();
}

export function parseHeader(caption) {
  const first = normalizeHeaderLine(caption.split("\n")[0]);
  const m = first.match(/^\|\s*(.+?)\s*[-–—]\s*(.+?)\s*(?:\(([^)]*)\))?\s*$/);
  if (!m) return null;
  let title_ko = "", year = "";
  if (m[3]) {
    const pm = m[3].match(/^(?:(.*?),\s*)?(\d{4})$/);
    if (pm) { title_ko = (pm[1] || "").trim(); year = pm[2]; }
    else title_ko = m[3].trim();
  }
  return { artist: m[1].trim(), title: m[2].trim(), title_ko, year };
}

// 본문: 헤더 다음 줄부터, 끝의 해시태그 블록 제거. `*설명` 줄은 source_note로.
export function extractBody(caption) {
  let lines = caption.split("\n").slice(1);
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && (!lines.at(-1).trim() || /^#/.test(lines.at(-1).trim()))) lines.pop();
  const notes = lines.filter((l) => /^\s*[*※]/.test(l)).map((l) => l.replace(/^\s*[*※]\s*/, "").trim());
  lines = lines.filter((l) => !/^\s*[*※]/.test(l));
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return { lines, note: notes.join(" · ") };
}

const hasKo = (l) => /[가-힣]/.test(l);
const hasKana = (l) => /[ぁ-んァ-ン]/.test(l);
const hasForeign = (l) => /[a-zA-Zぁ-んァ-ン一-龯]/.test(l);

// 원문·번역 쌍 → `> `. 한국어 곡(한글 우세)은 손대지 않는다.
export function convert(lines) {
  const nonblank = lines.filter((l) => l.trim());
  const koCount = nonblank.filter((l) => hasKo(l) && !hasKana(l)).length;
  const isKoSong = nonblank.length > 0 && koCount / nonblank.length > 0.65;
  if (isKoSong) return { out: [...lines], lang: "ko" };

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (
      cur?.trim() && next?.trim() &&
      hasForeign(cur) && !hasKo(cur) &&
      hasKo(next) && !hasKana(next)
    ) {
      out.push(cur, `> ${next}`);
      i++;
    } else {
      out.push(cur);
    }
  }
  const lang = nonblank.some((l) => hasKana(l)) ? "ja" : "en";
  return { out, lang };
}

export const sourceHash = (caption) => crypto.createHash("sha1").update(caption).digest("hex");
export const bodyHash = (lines) => crypto.createHash("sha1").update(lines.join("\n")).digest("hex");

// 곡 파일 본문. 메타(커버·미리듣기·앨범)는 비워 둔다 — 임포트는 원문만 옮기고
// 외부 카탈로그 조회는 scripts/meta-backfill.mjs가 엄격 매칭으로 따로 채운다.
export function buildSong({ header, lang, out, note, dateTag, ts, caption, bodyLines }) {
  const published = new Date(ts * 1000).toISOString();
  return `---
title: ${header.title}
title_ko: ${header.title_ko || (lang === "ko" ? header.title : "")}
artist: ${header.artist}
artist_ko:
album:
year: ${header.year || ""}
artwork:
preview:
trackId:
duration:
genre:
lang: ${lang}
tags: [${header.year || ""}]
keywords: []
emotion:
date: ${kstDay(published)}
published: ${published}
comment:
source: instagram
source_tag: ${dateTag}
source_note: ${note}
source_hash: ${sourceHash(caption)}
source_body_hash: ${bodyHash(bodyLines)}
---
${out.join("\n")}
`;
}

// 내보내기 폴더의 여러 파일(posts_1 / archived_posts / reels)은 구조가 조금씩
// 다르다 — 배열이기도 하고 한 겹 감싼 객체이기도 하다. 캡션·시각만 뽑아 같은
// 모양으로 만든다. 보관 게시물도 우리 입장에선 그냥 기록이다.
export function adaptPosts(json, sourceFile) {
  const arr = Array.isArray(json)
    ? json
    : json.ig_archived_post_media || json.ig_reels_media || Object.values(json).find(Array.isArray) || [];
  return arr
    .map((p) => ({
      caption: fixMojibake(p.title || p.media?.[0]?.title || ""),
      ts: p.creation_timestamp || p.media?.[0]?.creation_timestamp || 0,
      sourceFile,
    }))
    .filter((p) => p.caption.trim());
}

// 같은 곡을 여러 번 올린 경우 캡션이 같으면 한 게시글로 본다. 곡은 하나만 만들고
// 게시 이력(시각·출처 파일)은 전부 남긴다 — 언제 몇 번 올렸는지가 기록의 일부다.
export function dedupePosts(posts) {
  const byHash = new Map();
  for (const p of posts) {
    const h = sourceHash(p.caption);
    const prev = byHash.get(h);
    if (!prev) byHash.set(h, { ...p, reposts: [] });
    else {
      prev.reposts.push({ ts: p.ts, sourceFile: p.sourceFile });
      if (p.ts && (!prev.ts || p.ts < prev.ts)) {
        // 가장 이른 게시가 원본 — 나중 것을 이력으로 민다
        prev.reposts.push({ ts: prev.ts, sourceFile: prev.sourceFile });
        prev.ts = p.ts;
        prev.sourceFile = p.sourceFile;
      }
    }
  }
  return [...byHash.values()];
}

// 게시글 목록 → 저장 계획. 부작용 없음 — 같은 입력이면 같은 결과.
//   posts:    [{ caption, ts }]
//   existing: getAllSongs() 결과 (title/title_ko/artist/slug/source_hash)
export function planImport(posts, existing = []) {
  const haveKey = new Set(
    existing.flatMap((s) => [
      normText(`${s.title}|${s.artist}`),
      normText(`${s.title_ko || ""}|${s.artist}`),
    ])
  );
  const haveHash = new Set(existing.map((s) => s.source_hash).filter(Boolean));
  const usedSlugs = new Set(existing.map((s) => s.slug));
  const slugOf = (artist, title) => {
    let slug = `${artist} ${title}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "") || "insta";
    while (usedSlugs.has(slug)) slug += "-2";
    usedSlugs.add(slug);
    return slug;
  };

  const files = [], pending = [], review = [];
  let dupSkipped = 0;

  for (const post of posts) {
    const header = parseHeader(post.caption);
    if (!header) {
      review.push({ reason: "헤더 파싱 실패", head: post.caption.split("\n")[0] });
      continue;
    }
    // 같은 캡션(source_hash)이 이미 곡으로 있으면 재실행이다 — 제목이 바뀌었어도 건너뛴다
    const dup =
      haveHash.has(sourceHash(post.caption)) ||
      haveKey.has(normText(`${header.title}|${header.artist}`)) ||
      (header.title_ko && haveKey.has(normText(`${header.title_ko}|${header.artist}`)));
    if (dup) { dupSkipped++; continue; }

    const dateTag = (post.caption.match(/#(\d{6}_\d{4})/) || [])[1] || "";
    const { lines, note } = extractBody(post.caption);
    if (lines.filter((l) => l.trim()).length < 4) {
      pending.push({ ...header, ts: post.ts, tag: dateTag, sourceHash: sourceHash(post.caption) });
      continue;
    }

    const { out, lang } = convert(lines);
    // 무손실 검증 — 붙인 `> `만 벗겨 원본과 대조
    if (out.map((l) => l.replace(/^> /, "")).join("\n") !== lines.join("\n")) {
      review.push({ reason: "무손실 검증 실패", head: `${header.artist} - ${header.title}` });
      continue;
    }

    const slug = slugOf(header.artist, header.title);
    files.push({
      slug,
      lang,
      md: buildSong({ header, lang, out, note, dateTag, ts: post.ts, caption: post.caption, bodyLines: lines }),
      originalLineCount: lines.length,
      sourceHash: sourceHash(post.caption),
      sourceBodyHash: bodyHash(lines),
    });
    // 같은 실행 안에서 같은 곡이 두 번 나오면 두 번째는 중복으로 잡히게 등록
    haveKey.add(normText(`${header.title}|${header.artist}`));
    haveHash.add(sourceHash(post.caption));
  }

  return { files, pending, review, dupSkipped };
}
