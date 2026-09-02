import { latestArtworkPlan } from "../lib/latest-artwork";

// 그림 아래 붙는 벽면 라벨 — 제목·연도, 재료, 해설. 캔버스와 같은 plan에서 나오므로
// 글과 그림이 어긋나지 않는다.
export default function DayArtworkCaption({ latest }) {
  if (!latest) return null;
  const plan = latestArtworkPlan(latest);
  return (
    <figcaption className="border-t border-line px-4 py-3 text-[11px] leading-relaxed" data-latest-day-caption>
      <p className="font-serif text-sm">
        {plan.title}
        {plan.year && <span className="ml-1.5 text-xs text-muted">{plan.year}</span>}
      </p>
      <p className="mt-0.5 text-[10px] tracking-wide text-muted">{plan.medium}</p>
      <p className="mt-2 text-muted">{plan.body}</p>
    </figcaption>
  );
}
