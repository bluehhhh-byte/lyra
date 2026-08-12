import Link from "next/link";
import { readData } from "../../../lib/store";
import { getAllSongs } from "../../../lib/songs";
import { parseEmotion } from "../../../lib/keywords";
import CoverImage from "../../cover-image";

export const metadata = {
  title: "기록의 흐름 | Lyra",
  description: "곡을 담아온 순서 그대로 — 가사의 맥락이 끊어지지 않고 이어지는 하나의 이야기",
};

const kstDate = (iso) =>
  new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

// admin '기록의 흐름 분석'이 저장한 data/thread.json — 최근 기록 20곡을
// 시간 순서로 놓고, 모든 인접한 기록 사이를 가사의 맥락으로 잇는다.
// 위에는 그 전체가 그리는 하나의 이야기.
export default function ThreadPage() {
  const thread = readData("thread.json", null);
  const bySlug = new Map(getAllSongs().map((s) => [s.slug, s]));
  const timeline = (thread?.slugs || []).filter((slug) => bySlug.has(slug));

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">기록의 흐름</h1>
          <p className="mt-1 text-sm text-muted">담아온 순서 그대로, 가사의 맥락이 이어지는 하나의 이야기</p>
        </div>
        <Link href="/songs/motifs" className="text-sm text-accent hover:underline">
          가사 모티프 →
        </Link>
      </div>

      {!thread || timeline.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 흐름이 없습니다.
          <br />
          관리자 → 등록된 곡에서 “흐름 분석”을 누르면 최근 기록이 하나의 이야기로 이어집니다.
        </div>
      ) : (
        <>
          {thread.story && (
            <div className="mb-10 rounded-xl border border-accent/30 bg-accent/5 px-5 py-4 text-sm leading-relaxed">
              {thread.story}
            </div>
          )}
          <ol className="mx-auto max-w-2xl">
            {timeline.map((slug, i) => {
              const s = bySlug.get(slug);
              const connection = thread.connections?.[i] || "";
              return (
                <li key={slug}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Link href={`/songs/${slug}`} aria-label={`${s.title} 보기`} className="group shrink-0">
                      <CoverImage
                        src={s.artwork}
                        alt=""
                        label={s.title}
                        loading="lazy"
                        className="h-12 w-12 rounded-lg border border-line object-cover transition group-hover:opacity-80 group-hover:ring-2 group-hover:ring-accent/40"
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
                    <div className="my-2 ml-6 border-l-2 border-dashed border-accent/30 py-1 pl-6 text-xs leading-relaxed text-accent/80">
                      {connection || <span className="text-muted/40">···</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mx-auto mt-6 max-w-2xl text-right text-xs text-muted/50">
            최근 {timeline.length}곡 · {kstDate(thread.at)} 분석
          </p>
        </>
      )}
    </>
  );
}
