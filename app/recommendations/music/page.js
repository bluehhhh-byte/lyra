import Link from "next/link";
import { readRuntimeData } from "../../../lib/store";
import { getAllSongsRuntime } from "../../../lib/songs";
import { normText } from "../../../lib/admin/itunes";
import SongRecs from "../song-recs";

export const metadata = {
  title: "추천 곡 | Lyra",
  description: "컬렉션 취향을 바탕으로 Gemini가 추천한, 아직 담지 않은 곡들",
};

const kstDate = (iso) =>
  new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

// 관리자 → 등록된 곡 → "추천 곡 생성"이 누적하는 data/song-recs.json.
// 같은 at을 공유하는 항목이 한 회차 — 최신 회차는 '취향의 연장선'과
// '새로운 방향'으로 나눠 보여주고, 이전 회차는 날짜별로 접어둔다.
export default async function MusicRecommendationsPage() {
  const [recs, songs] = await Promise.all([
    readRuntimeData("song-recs.json", { items: [], runs: [] }),
    getAllSongsRuntime(),
  ]);
  // 추천 후 컬렉션에 담은 곡은 다음 생성을 기다리지 않고 즉시 숨긴다
  const haveTrack = new Set(songs.map((s) => String(s.trackId)).filter(Boolean));
  const haveKey = new Set(songs.map((s) => `${normText(s.title)}|${normText(s.artist)}`));
  const items = (recs.items || []).filter(
    (m) => !haveTrack.has(String(m.trackId)) && !haveKey.has(`${normText(m.title)}|${normText(m.artist)}`)
  );

  // 회차 = 같은 at 그룹 (생성 시 전 항목이 같은 타임스탬프를 받는다)
  const batches = new Map();
  for (const m of items) {
    if (!batches.has(m.at)) batches.set(m.at, []);
    batches.get(m.at).push(m);
  }
  const ordered = [...batches.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const [latest, ...older] = ordered;
  const runLabel = (at) => (recs.runs || []).find((r) => r.at === at)?.label || "";

  const latestExtend = latest?.[1].filter((m) => m.direction !== "discover") || [];
  const latestDiscover = latest?.[1].filter((m) => m.direction === "discover") || [];
  // 옛 데이터(방향 없음)는 전부 extend로 몰리므로, discover가 없으면 나누지 않는다
  const split = latestDiscover.length > 0;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">추천 곡</h1>
          <p className="mt-1 text-sm text-muted">
            {latest
              ? `${kstDate(latest[0])} 생성${runLabel(latest[0]) ? ` · ${runLabel(latest[0])}` : ""} — ▶로 30초 미리듣기`
              : "컬렉션 취향으로 고른, 아직 담지 않은 곡"}
          </p>
        </div>
        <div className="flex gap-4">
          <Link href="/songs/taste" className="text-sm text-accent hover:underline">
            음악 취향 →
          </Link>
          <Link href="/recommendations" className="text-sm text-accent hover:underline">
            추천 영화 →
          </Link>
        </div>
      </div>

      {!latest ? (
        <div className=" border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 추천 곡이 없습니다.
          <br />
          관리자 → 등록된 곡에서 “추천 곡 생성”을 누르면 여기에 쌓입니다.
        </div>
      ) : split ? (
        <>
          {latestExtend.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-1 text-sm font-semibold text-muted">취향의 연장선</h2>
              <p className="mb-4 text-xs text-muted/60">지금 많이 담는 장르·감정·시대와 가까운 곡</p>
              <SongRecs items={latestExtend} />
            </section>
          )}
          {latestDiscover.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-1 text-sm font-semibold text-muted">새로운 방향</h2>
              <p className="mb-4 text-xs text-muted/60">연결점은 있지만 다른 국가·시대·아티스트의 곡</p>
              <SongRecs items={latestDiscover} />
            </section>
          )}
        </>
      ) : (
        <section className="mb-12">
          <SongRecs items={latest[1]} />
        </section>
      )}

      {older.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted">이전 추천</h2>
          <div className="space-y-2">
            {older.map(([at, list]) => (
              <details key={at} className=" border border-line px-4 py-3">
                <summary className="cursor-pointer text-sm text-muted hover:text-accent">
                  {kstDate(at)}
                  {runLabel(at) ? ` · ${runLabel(at)}` : ""} · {list.length}곡
                </summary>
                <div className="pt-4">
                  <SongRecs items={list} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
