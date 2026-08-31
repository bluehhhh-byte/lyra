import { latestArtworkPlan } from "../lib/latest-artwork";

// 그림 아래 붙는 제목·지시문·해설. 캔버스와 같은 plan에서 나오므로 글과 그림이 어긋나지 않는다.
export default function DayArtworkCaption({ latest }) {
  if (!latest) return null;
  const plan = latestArtworkPlan(latest);
  return (
    <figcaption className="border-t border-line px-4 py-3 text-[11px] leading-relaxed" data-latest-day-caption>
      <p className="font-serif text-sm">{plan.title}</p>
      <p className="mt-1 text-muted">{plan.instruction}</p>
      <p className="mt-1 text-muted/70">{plan.caption}</p>
    </figcaption>
  );
}
