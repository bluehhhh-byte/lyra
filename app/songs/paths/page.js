import Link from "next/link";
import { readData } from "../../../lib/store";
import PathSteps from "./path-steps";

export const metadata = {
  title: "발견 경로 | Lyra",
  description: "시작·전환·도착 구조를 가진 짧은 음악 탐색 코스",
};

const kstDate = (iso) =>
  new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

// admin '경로 만들기'가 저장한 data/paths.json — 두 곡 사이의 다리(bridge)와
// 주제 코스(theme)가 쌓인다. 정거장을 순서대로 들으면 짧은 음악 에세이.
export default function PathsPage() {
  const items = readData("paths.json", { items: [] }).items || [];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">발견 경로</h1>
          <p className="mt-1 text-sm text-muted">시작·전환·도착 — 정거장을 순서대로 들어보는 짧은 코스</p>
        </div>
        <Link href="/recommendations/music" className="text-sm text-accent hover:underline">
          추천 곡 →
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 경로가 없습니다.
          <br />
          관리자 → 발견 경로에서 두 곡을 잇거나 주제를 던지면 여기에 쌓입니다.
        </div>
      ) : (
        <div className="space-y-8">
          {items.map((p) => (
            <section key={p.id} className="rounded-xl border border-line bg-surface/50 px-5 py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{p.title}</h2>
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
    </>
  );
}
