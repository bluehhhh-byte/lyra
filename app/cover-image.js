"use client";
import { useState } from "react";

// 앨범아트·포스터는 외부 URL(애플·TMDB)이라 언제든 죽을 수 있다. 로드 실패나
// src 없음이면 같은 자리에 제목 텍스트 블록을 보여줘 카드가 깨지지 않게 한다.
// srcSet 등 나머지 props는 <img>로 그대로 전달.
export default function CoverImage({ label, className, ...img }) {
  const [failed, setFailed] = useState(false);
  if (failed || !img.src)
    return (
      <div className={`flex items-center justify-center bg-surface p-2 text-center text-xs text-muted ${className || ""}`}>
        {label || img.alt || ""}
      </div>
    );
  return <img {...img} className={className} onError={() => setFailed(true)} />;
}
