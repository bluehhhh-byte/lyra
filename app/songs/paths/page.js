import Link from "next/link";
import { readData } from "../../../lib/store";
import { getAllSongs } from "../../../lib/songs";
import { parseEmotion } from "../../../lib/keywords";
import CoverImage from "../../cover-image";
import PathSteps from "./path-steps";

export const metadata = {
  title: "흐름과 경로 | Lyra",
  description: "기록해 온 곡들의 주제의식이 이어지는 흐름과, 새 곡으로 건너가는 발견 경로",
};

const kstDate = (iso) =>
  new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

// 두 축: '기록의 흐름'은 이미 담아온 곡들의 순서를 서사로 읽고(가사 연결의
// 상관관계 추정), '발견 경로'는 그 취향에서 새 곡으로 건너가는 코스다.
export default function PathsPage() {
  const items = readData("paths.json", { items: [] }).items || [];
  const thread = readData("thread.json", null);
  const bySlug = new Map(getAllSongs().map((s) => [s.slug, s]));

  // 흐름 타임라인: 연결에 등장하는 곡만, 기록 순서대로
  const involved = new Set((thread?.links || []).flatMap((l) => [l.from, l.to]));
  const timeline = (thread?.slugs || []).filter((slug) => involved.has(slug) && bySlug.has(slug));
  const linkFrom = new Map((thread?.links || []).map((l) => [l.from, l]));

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">흐름과 경로</h1>
          <p className="mt-1 text-sm text-muted">기록의 주제의식이 이어지는 흐름, 그리고 새 곡으로 건너가는 코스</p>
        </div>
        <Link href="/songs/motifs" className="text-sm text-accent hover:underline">
          가사 모티프 →
        </Link>
      </div>

      {/* 기록의 흐름 — 담아온 순서에서 가사 연결의 상관관계를 추정한 서사 */}
      <section className="mb-14">
        <h2 className="mb-1 text-sm font-semibold text-muted">기록의 흐름</h2>
        <p className="mb-4 text-xs text-muted/60">
          최근 기록 순서에서 가사·주제가 어떻게 이어지는지 — 인접한 기록 사이의 연결만 추정한다
        </p>
        {!thread ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
            관리자 → 발견 경로에서 “기록의 흐름 분석”을 누르면 여기에 그려집니다.
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface/50 px-5 py-5">
            {thread.summary && <p className="mb-5 text-sm leading-relaxed">{thread.summary}</p>}
            <ol>
              {timeline.map((slug, i) => {
                const s = bySlug.get(slug);
                const link = linkFrom.get(slug);
                const nextInTimeline = timeline[i + 1];
                return (
                  <li key={slug}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Link href={`/songs/${slug}`} aria-label={`${s.title} 보기`} className="group shrink-0">
                        <CoverImage
                          src={s.artwork}
                          alt=""
                          label={s.title}
                          loading="lazy"
                          className="h-11 w-11 rounded-lg border border-line object-cover transition group-hover:opacity-80 group-hover:ring-2 group-hover:ring-accent/40"
                        />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-snug">
                          {s.title} <span className="font-normal text-muted">· {s.artist}</span>
                        </p>
                        <p className="text-xs text-muted/60">
                          {(s.published || s.date || "").slice(0, 10)}
                          {parseEmotion(s.emotion) ? ` · ${parseEmotion(s.emotion)}` : ""}
                        </p>
                      </div>
                    </div>
                    {i < timeline.length - 1 && (
                      <div className="my-1.5 ml-5 border-l-2 border-dashed border-line pl-6 text-xs leading-relaxed text-accent/80">
                        {link && link.to === nextInTimeline ? link.connection : <span className="text-muted/40">···</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 text-right text-xs text-muted/50">{kstDate(thread.at)} 분석</p>
          </div>
        )}
      </section>

      {/* 발견 경로 — 컬렉션 밖 새 곡으로 건너가는 다리·주제 코스 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-muted">발견 경로</h2>
        <p className="mb-4 text-xs text-muted/60">
          위 취향에서 출발해 새 곡으로 건너가는 코스 — 정거장을 순서대로 들어보는 짧은 여정
        </p>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
            관리자 → 발견 경로에서 두 곡을 잇거나 주제를 던지면 여기에 쌓입니다.
          </div>
        ) : (
          <div className="space-y-8">
            {items.map((p) => (
              <section key={p.id} className="rounded-xl border border-line bg-surface/50 px-5 py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold">{p.title}</h3>
                  <span className="text-xs text-muted/60">
                    {p.type === "bridge" ? "다리" : "주제"} · {kstDate(p.at)}
                  </span>
                </div>
                {p.note && <p className="mt-1 text-sm text-muted">{p.note}</p>}
                <PathSteps steps={p.steps} />
              </section>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
