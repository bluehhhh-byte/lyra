"use client";
import { useState } from "react";

// 앨범아트·포스터는 외부 URL(애플·TMDB)이라 언제든 죽을 수 있다. 로드 실패나
// src 없음이면 같은 자리에 제목 텍스트 블록을 보여줘 카드가 깨지지 않게 한다.
// srcSet 등 나머지 props는 <img>로 그대로 전달.
export default function CoverImage({ label, className, fallback = null, ...img }) {
  const [failed, setFailed] = useState(false);
  if (failed || !img.src) {
    if (fallback) return fallback;
    return (
      <div className={`flex items-center justify-center border border-line bg-surface p-2 text-center text-xs text-muted ${className || ""}`}>
        {label || img.alt || ""}
      </div>
    );
  }
  // 표지가 어두우면(#12100e에 가까운 표지가 흔하다) 배경과 같은 검정으로 뭉개져
  // 이미지가 깨진 것처럼 보였다. 아주 옅은 테두리 한 겹이 그 경계를 만든다 —
  // 밝은 표지에서는 거의 보이지 않는다.
  return <img {...img} className={`border border-line/40 ${className || ""}`} onError={() => setFailed(true)} />;
}
