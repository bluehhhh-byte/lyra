import Link from "next/link";
import CoverImage from "./cover-image";
import { shiftSentence } from "../lib/home-insights";
import { workLabel } from "../lib/latest-day";
import RelativeDay from "./relative-day";
import { InkUnderline } from "./ink-details";
import InkArtwork from "./ink-artwork";
import { LatestDayScene } from "./fable-scenes";
import DayArtworkCaption from "./day-artwork-caption";

function RecordCard({ item }) {
  const href = item.kind === "music" ? `/songs/${item.slug}` : `/movies/${item.slug}`;
  return (
    <Link href={href} className="group min-w-0">
      <div className="aspect-square overflow-hidden  border border-line bg-surface">
        <CoverImage
          src={item.image}
          alt=""
          label={item.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          fallback={item.kind === "music" ? <InkArtwork slug={item.slug} label={item.title} className="h-full w-full" /> : null}
        />
      </div>
      <p className="mt-2 truncate text-sm font-semibold group-hover:text-accent">{item.title}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{item.subtitle}</p>
    </Link>
  );
}

// 최신 기록 날짜의 감정 분석 — 저장된 문장이 아니라 지금 데이터로 매번 계산된 것이다
function LatestDay({ latest }) {
  if (!latest?.text) return null;
  const link = (item) =>
    item && (
      <Link
        key={`${item.kind}-${item.slug}`}
        href={item.kind === "music" ? `/songs/${item.slug}` : `/movies/${item.slug}`}
        className="text-accent hover:underline [overflow-wrap:anywhere]"
      >
        {workLabel(item)}
      </Link>
    );
  const links = [link(latest.repSong), link(latest.repMovie)].filter(Boolean);
  return (
    <section className="mb-14 grid min-w-0 overflow-hidden border border-line bg-surface sm:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="px-5 py-5 sm:px-7 sm:py-7">
        <p className="text-xs font-semibold text-accent">
          <RelativeDay day={latest.day} />
        </p>
        <p className="mt-2 max-w-3xl font-serif text-base leading-7 sm:text-lg sm:leading-8">{latest.text}</p>
        {links.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {links.map((l, i) => <span key={i} className="min-w-0">{l}</span>)}
            <Link href={`/archive/${latest.day}`} className="text-muted hover:text-accent hover:underline">
              지난 리포트 보기 →
            </Link>
          </p>
        )}
      </div>
      <figure className="flex min-w-0 flex-col border-t border-line bg-bg/[0.28] sm:border-l sm:border-t-0">
        <div className="relative min-h-52 flex-1 overflow-hidden">
          <LatestDayScene latest={latest} className="absolute inset-0 h-full w-full" />
        </div>
        <DayArtworkCaption latest={latest} />
      </figure>
    </section>
  );
}

export default function HomeIntro({ insights }) {
  const { taste, shift, recent, latest } = insights;
  return (
    <div className="relative isolate mb-16 overflow-hidden pt-4">
      <section className="mb-14 border-y border-line bg-bg/[0.88]">
        <div className="py-10 sm:pr-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-accent">A cultural biography</p>
          {/* 영어 제목 — 단어 중간이 잘리지 않게 balance로 줄을 나눈다 */}
          <h1 className="max-w-4xl text-balance font-serif text-3xl leading-tight sm:text-5xl sm:leading-tight">
            The Words that Shaped the World
          </h1>
          <InkUnderline className="mt-3 h-2 w-48 sm:w-72" />
          {/* 고정 소개문. 여기에 취향 통계 문장을 이어 붙이지 않는다 — 통계는 아래 줄과
              /songs/taste에 따로 있다 */}
          <p className="mt-6 text-sm leading-7 text-muted sm:whitespace-nowrap sm:text-base">
            좋아했던 가사와 번역한 노래, 오래 남은 영화 장면이 세계를 이해하는 방식에 남긴 흔적을 시간순으로 모은 기록이다.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
            <span>{taste.count}곡</span>
            <span>{taste.artist.length}팀</span>
            {taste.emotion[0] && <span>대표 감정 {taste.emotion[0][0]}</span>}
            {taste.decade[0] && <span>중심 시대 {taste.decade[0][0]}</span>}
            <Link href="/songs/taste" className="text-accent hover:underline">취향의 근거 보기 →</Link>
          </div>
        </div>
      </section>

      <LatestDay latest={latest} />

      {recent.length > 0 && (
        <section className="mb-14">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">최근의 문화 기록</h2>
              <InkUnderline className="mt-1 h-1.5 w-28" />
              <p className="mt-1 text-xs text-muted">음악과 영화를 하나의 시간 위에서 봅니다.</p>
            </div>
            <Link href="/archive" className="text-xs text-accent hover:underline">아카이브 →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {recent.map((item) => <RecordCard key={`${item.kind}-${item.slug}`} item={item} />)}
          </div>
        </section>
      )}

      <section className="mb-14 grid gap-5  border border-line bg-surface px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-7">
        <div>
          <p className="text-xs font-semibold text-accent">요즘의 변화</p>
          <p className="mt-2 max-w-2xl text-sm leading-6">{shiftSentence(shift)}</p>
        </div>
        <Link href="/songs/taste" className="text-xs text-muted hover:text-accent">변화를 만든 곡 보기 →</Link>
      </section>
    </div>
  );
}
