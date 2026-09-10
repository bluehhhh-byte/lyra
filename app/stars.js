// 별점 하나를 세 파일이 각자 복사해 두고 크기만 달랐다 — 목록에서는 12px,
// 상세에서는 16px, 통계에서는 14px이라 같은 값이 화면마다 다른 무게로 읽혔다.
//
// 별만으로는 4와 4.5를 눈으로 가르기 어렵다. 숫자를 옆에 붙이면 별은 한눈의
// 인상을, 숫자는 정확한 값을 맡는다. 미평점은 빈 별 다섯 개로 얼버무리지 않고
// "미평"이라 쓴다 — 0점과 평가하지 않음은 다른 사실이다.
const SIZE = { sm: "text-sm", md: "text-base" };

export default function Stars({ value, size = "sm", showNumber = true, className = "" }) {
  const rated = typeof value === "number" && value > 0;
  if (!rated) {
    return <span className={`text-xs text-muted ${className}`}>미평</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 leading-none ${className}`}>
      <span className={`relative inline-block align-middle ${SIZE[size] || SIZE.sm}`} aria-label={`별점 ${value}/5`}>
        <span className="text-muted/30">★★★★★</span>
        <span className="absolute inset-0 overflow-hidden text-accent" style={{ width: `${(value / 5) * 100}%` }}>
          ★★★★★
        </span>
      </span>
      {showNumber && <span className="text-xs tabular-nums text-muted">{value.toFixed(1)}</span>}
    </span>
  );
}
