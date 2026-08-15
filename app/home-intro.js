import Link from "next/link";
import CoverImage from "./cover-image";
import { shiftSentence } from "../lib/home-insights";

function RecordCard({ item, compact = false }) {
  const href = item.kind === "music" ? `/songs/${item.slug}` : `/movies/${item.slug}`;
  return (
    <Link href={href} className="group min-w-0">
      <div className={`overflow-hidden rounded-xl border border-line bg-surface ${compact && item.kind === "movie" ? "aspect-[2/3]" : "aspect-square"}`}>
        <CoverImage
          src={item.image}
          alt=""
          label={item.title}
          loading={compact ? "lazy" : undefined}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <p className="mt-2 truncate text-sm font-semibold group-hover:text-accent">{item.title}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{item.subtitle}</p>
    </Link>
  );
}

export default function HomeIntro({ insights }) {
  const { taste, portrait, shift, recent, revisit } = insights;
  return (
    <div className="mb-16 pt-4">
      <section className="mb-14 border-b border-line pb-12">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-accent">A cultural biography</p>
        {/* 영어 제목 — 단어 중간이 잘리지 않게 balance로 줄을 나눈다 */}
        <h1 className="max-w-4xl text-balance font-serif text-3xl leading-tight sm:text-5xl sm:leading-tight">
          The Words that Shaped the World
        </h1>
        <p className="mt-6 max-w-3xl text-sm leading-7 text-muted sm:text-base">
          한 줄의 가사와 한 편의 영화가 세계를 이해하는 방식에 남긴 흔적.
          좋아했던 문장, 번역하고 되새긴 노래, 오래 남은 장면을 시간의 순서로 모은 기록이다.
          {portrait ? ` ${portrait}` : ""}
        </p>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <span>{taste.count}곡</span>
          <span>{taste.artist.length}팀</span>
          {taste.emotion[0] && <span>대표 감정 {taste.emotion[0][0]}</span>}
          {taste.decade[0] && <span>중심 시대 {taste.decade[0][0]}</span>}
          <Link href="/songs/taste" className="text-accent hover:underline">취향의 근거 보기 →</Link>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mb-14">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">최근의 문화 기록</h2>
              <p className="mt-1 text-xs text-muted">음악과 영화를 하나의 시간 위에서 봅니다.</p>
            </div>
            <Link href="/archive" className="text-xs text-accent hover:underline">아카이브 →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {recent.map((item) => <RecordCard key={`${item.kind}-${item.slug}`} item={item} />)}
          </div>
        </section>
      )}

      <section className="mb-14 grid gap-5 rounded-2xl border border-line bg-surface px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-7">
        <div>
          <p className="text-xs font-semibold text-accent">요즘의 변화</p>
          <p className="mt-2 max-w-2xl text-sm leading-6">{shiftSentence(shift)}</p>
        </div>
        <Link href="/songs/taste" className="text-xs text-muted hover:text-accent">변화를 만든 곡 보기 →</Link>
      </section>

      {revisit.length > 0 && (
        <section>
          <div className="mb-5">
            <h2 className="text-lg font-bold">다시 꺼내 본 기록</h2>
            <p className="mt-1 text-xs text-muted">최근 기록 뒤에 묻힌 오래된 음악과 영화를 다시 만납니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {revisit.map((item) => <RecordCard key={`${item.kind}-${item.slug}`} item={item} compact />)}
          </div>
        </section>
      )}
    </div>
  );
}
