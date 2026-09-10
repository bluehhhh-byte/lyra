"use client";
import { useState } from "react";

// 앨범아트·포스터는 외부 URL(애플·TMDB)이라 언제든 죽을 수 있다. 로드 실패나
// src 없음이면 같은 자리에 제목 텍스트 블록을 보여줘 카드가 깨지지 않게 한다.
// srcSet 등 나머지 props는 <img>로 그대로 전달.
export default function CoverImage({ label, sublabel = "", className, fallback = null, ...img }) {
  const [failed, setFailed] = useState(false);
  if (failed || !img.src) {
    if (fallback) return fallback;
    // 표지가 없을 때도 카드는 카드여야 한다. 제목은 본문과 같은 세리프로 세우고
    // 연도를 아래 받쳐, 자리를 채우는 회색 상자가 아니라 활자로 만든 표지가 되게
    // 한다. className으로 받은 비율(aspect-square·aspect-[2/3])을 그대로 쓰므로
    // 그리드 높이는 흔들리지 않는다.
    return (
      <div className={`flex flex-col items-center justify-center gap-1 border border-line bg-surface p-3 text-center ${className || ""}`}>
        <span className="line-clamp-3 font-serif text-sm leading-snug text-ink/85">{label || img.alt || ""}</span>
        {sublabel && <span className="text-[11px] tabular-nums text-muted">{sublabel}</span>}
      </div>
    );
  }
  // 표지가 어두우면(#12100e에 가까운 표지가 흔하다) 배경과 같은 검정으로 뭉개져
  // 이미지가 깨진 것처럼 보였다. 아주 옅은 테두리 한 겹이 그 경계를 만든다 —
  // 밝은 표지에서는 거의 보이지 않는다.
  return <img {...img} className={`border border-line/40 ${className || ""}`} onError={() => setFailed(true)} />;
}
