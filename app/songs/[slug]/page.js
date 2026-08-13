import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllSongs, getSong } from "../../../lib/songs";
import { genreTagOf, COUNTRY_TAGS } from "../../../lib/genre";
import { parseEmotion } from "../../../lib/keywords";
import { getAllMovies } from "../../../lib/movies";
import CoverImage from "../../cover-image";
import LyricsView from "./lyrics-view";
import { appleUrl, isExactApple } from "../../../lib/apple";
import PlayButton from "./play-button";
import ShareButton from "./share-button";
import SongNav from "./song-nav";
import YouTubeEmbed from "./youtube-embed";

export function generateStaticParams() {
  return getAllSongs().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const song = getSong(decodeURIComponent(slug));
  if (!song) return {};
  const title = `${song.title} — ${song.artist}`;
  const description = song.comment || `${song.title} 가사와 한글 번역`;
  return {
    title: `${title} | Lyra`,
    description,
    openGraph: {
      title,
      description,
      images: song.artwork ? [{ url: song.artwork, width: 600, height: 600 }] : [],
      type: "article",
    },
    twitter: { card: "summary", title, description, images: song.artwork ? [song.artwork] : [] },
  };
}

import { kstDay } from "../../../lib/kst";

// "2026년 7월 14일 22:03" in KST; drops the time for a date-only value
function formatPublished(v) {
  const d = new Date(v.length <= 10 ? `${v}T00:00:00+09:00` : v);
  if (isNaN(d)) return v;
  const withTime = v.length > 10;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(d);
}

function relatedSongs(song, all) {
  const tags = new Set(song.tags);
  return all
    .filter((s) => s.slug !== song.slug)
    .map((s) => {
      let score = 0;
      if (s.artist === song.artist) score += 5;
      score += s.tags.filter((t) => tags.has(t)).length;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.s);
}

export default async function SongPage({ params }) {
  const { slug } = await params;
  const all = getAllSongs();
  const idx = all.findIndex((s) => s.slug === decodeURIComponent(slug));
  const song = all[idx];
  if (!song) notFound();
  const related = relatedSongs(song, all);
  const pick = (s) => s && { slug: s.slug, title: s.title };
  const prev = pick(all[idx - 1]);
  const next = pick(all[idx + 1]);

  // 컬렉션 안에서 이 곡의 자리 — 같은 장르·감정·시대·권역·아티스트가 몇 곡인지
  const genre = genreTagOf(song.tags);
  const emotion = parseEmotion(song.emotion);
  const decade = song.year ? `${Math.floor(+song.year / 10) * 10}년대` : "";
  const region = song.tags.find((t) => COUNTRY_TAGS.includes(t)) || "";
  const countBy = (fn) => all.filter(fn).length;
  const position = [
    genre && { key: "genre", label: genre, href: `/tags/${encodeURIComponent(genre)}`, count: countBy((s) => genreTagOf(s.tags) === genre) },
    emotion && { key: "emotion", label: `${emotion}의 감정`, href: `/?emotion=${encodeURIComponent(emotion)}`, count: countBy((s) => parseEmotion(s.emotion) === emotion) },
    decade && { key: "decade", label: `${decade} 곡`, href: `/?decade=${parseInt(decade)}s`, count: countBy((s) => s.year && `${Math.floor(+s.year / 10) * 10}년대` === decade) },
    region && region !== "기타" && { key: "region", label: region, href: `/tags/${encodeURIComponent(region)}`, count: countBy((s) => s.tags.includes(region)) },
    countBy((s) => s.artist === song.artist) > 1 && { key: "artist", label: `${song.artist}의 곡`, href: `/?q=${encodeURIComponent(song.artist)}`, count: countBy((s) => s.artist === song.artist) },
  ].filter(Boolean);

  // Lyra×Syno 교차 — 같은 시대의 큐레이션 영화 (같은 권역 우선)
  const songDecadeNum = song.year ? Math.floor(+song.year / 10) * 10 : null;
  const eraMovies = songDecadeNum
    ? getAllMovies()
        .filter((m) => m.year && Math.floor(+m.year / 10) * 10 === songDecadeNum)
        .sort((a, b) => (b.tags.includes(region) ? 1 : 0) - (a.tags.includes(region) ? 1 : 0))
        .slice(0, 3)
    : [];

  return (
    <article>
      {/* hero — 커버 없는 곡(artwork_none 등)은 배경 없이 텍스트 히어로 */}
      <div className="relative mb-12 overflow-hidden rounded-2xl border border-line">
        {song.artwork && (
          <img
            src={song.artwork}
            alt=""
            aria-hidden
            className="hero-ambient absolute inset-0 h-full w-full object-cover opacity-40 blur-3xl"
          />
        )}
        <div className="relative flex flex-col items-center gap-6 px-6 py-12 sm:flex-row sm:items-end sm:px-10">
          {song.artwork ? (
            <img
              src={song.artwork}
              alt={`${song.title} album art`}
              className="w-40 rounded-xl shadow-2xl sm:w-48"
            />
          ) : (
            <div className="flex aspect-square w-40 items-center justify-center rounded-xl border border-line bg-surface p-4 text-center text-sm text-muted sm:w-48">
              {song.title}
            </div>
          )}
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{song.title}</h1>
            {song.title_ko && song.title_ko !== song.title && (
              <p className="mt-1 text-lg text-muted">{song.title_ko}</p>
            )}
            <p className="mt-2 text-muted">
              {[
                song.artist_ko && song.artist_ko !== song.artist
                  ? `${song.artist} (${song.artist_ko})`
                  : song.artist,
                song.album,
                song.year,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {song.tags.map((t) => (
                <Link
                  key={t}
                  href={`/tags/${encodeURIComponent(t)}`}
                  className="rounded-full border border-line bg-bg/50 px-2.5 py-0.5 text-xs text-muted hover:text-accent"
                >
                  {t}
                </Link>
              ))}
              {/* 가사 키워드 — 태그와 달리 #표기, 누르면 이 단어가 나오는
                  다른 곡을 기존 가사 검색으로 찾는다 */}
              {(song.keywords || []).map((w) => (
                <Link
                  key={w}
                  href={`/?q=${encodeURIComponent(w)}`}
                  className="rounded-full border border-dashed border-line bg-bg/50 px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
                >
                  #{w}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              {song.preview && (
                <PlayButton
                  track={{
                    slug: song.slug,
                    title: song.title,
                    artist: song.artist,
                    artwork: song.artwork,
                    preview: song.preview,
                    provider: song.preview_provider || "",
                    externalUrl: appleUrl(song),
                  }}
                />
              )}
              <YouTubeEmbed artist={song.artist} title={song.title} query={song.youtube} id={song.youtube_id} />
              {/* 커버·미리듣기를 스토어에서 가져다 쓰므로 그 곡의 스토어 페이지로 가는
                  길은 언제나 열어 둔다 — 정확 매칭이 없으면 검색 결과로 보낸다 */}
              <a
                href={appleUrl(song)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-line bg-bg/50 px-3 py-1.5 text-xs text-muted hover:text-accent"
              >
                ♪ Apple Music{isExactApple(song) ? "" : " 검색"}
              </a>
              <ShareButton title={song.title} artist={song.artist} />
            </div>
          </div>
        </div>
      </div>

      {/* comment */}
      {song.comment && (
        <p className="mx-auto mb-14 max-w-2xl border-l-2 border-accent pl-4 text-sm leading-relaxed text-muted">
          {song.comment}
        </p>
      )}

      {/* lyrics */}
      <LyricsView
        stanzas={song.stanzas}
        lang={song.lang}
        song={{
          slug: song.slug,
          title: song.title,
          title_ko: song.title_ko && song.title_ko !== song.title ? song.title_ko : "",
          artist: song.artist,
          artwork: song.artwork,
          year: song.year || "",
          album: song.album || "",
          // the AI-corrected genre lives in tags (J-Rock), not the raw iTunes
          // store field (J-Pop) — show what the rest of the site shows
          genre: genreTagOf(song.tags) || song.genre || "",
        }}
      />

      {/* when this entry went up — full datetime if recorded, else the date */}
      {(song.published || song.date) && (
        <p className="mx-auto mt-12 max-w-2xl text-right text-xs text-muted/60">
          <Link
            href={`/archive/${kstDay(song.published || song.date)}`}
            className="hover:text-accent"
          >
            기록 {formatPublished(song.published || song.date)}
          </Link>
        </p>
      )}

      {/* 이 컬렉션에서의 위치 — 곡 하나를 전체 아카이브와 잇는다.
          별점이 없는 아카이브라 '몇 곡 중 하나'라는 자리가 곧 맥락이다. */}
      {position.length > 0 && (
        <div className="mx-auto mt-16 max-w-2xl rounded-xl border border-line bg-surface px-5 py-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">이 컬렉션에서</h2>
          <ul className="space-y-1 text-sm text-muted">
            {position.map(({ key, label, href, count }) => (
              <li key={key}>
                {href ? (
                  <Link href={href} className="text-ink hover:text-accent hover:underline">{label}</Link>
                ) : (
                  <span className="text-ink">{label}</span>
                )}
                {` ${count}곡 중 하나`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* related */}
      {related.length > 0 && (
        <div className="mx-auto mt-20 max-w-2xl">
          <h2 className="mb-4 text-sm font-semibold text-muted">이런 곡도</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
            {related.map((s) => (
              <Link key={s.slug} href={`/songs/${s.slug}`} className="group">
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  <CoverImage
                    src={s.artwork}
                    alt=""
                    label={s.title}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
                  />
                </div>
                <h3 className="mt-2 truncate text-xs font-medium group-hover:text-accent">
                  {s.title}
                </h3>
                <p className="truncate text-xs text-muted">{s.artist}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Lyra×Syno — 이 곡의 시대를 함께 보는 큐레이션 영화 */}
      {eraMovies.length > 0 && (
        <div className="mx-auto mt-14 max-w-2xl">
          <h2 className="mb-4 text-sm font-semibold text-muted">
            이 시대의 영화 <span className="text-xs font-normal text-muted/60">{songDecadeNum}년대의 기록</span>
          </h2>
          <div className="grid grid-cols-3 gap-x-4 gap-y-6">
            {eraMovies.map((m) => (
              <Link key={m.slug} href={`/movies/${m.slug}`} className="group">
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  <img
                    src={m.poster}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-[2/3] w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
                  />
                </div>
                <h3 className="mt-2 truncate text-xs font-medium group-hover:text-accent">{m.title_ko || m.title}</h3>
              </Link>
            ))}
          </div>
        </div>
      )}

      {(prev || next) && <SongNav prev={prev} next={next} />}

      <div className="mx-auto mt-16 flex max-w-2xl justify-between">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← 음악으로
        </Link>
        {process.env.NODE_ENV !== "production" && (
          <Link href={`/admin/edit/${song.slug}`} className="text-sm text-muted hover:text-accent">
            수정 ✎
          </Link>
        )}
      </div>
    </article>
  );
}
