"use client";

import { useEffect, useState } from "react";

// 일정 스크롤 이상에서만 나타나는 맨 위로 버튼. 플레이어 바(z-30, 하단 고정)와
// 곡 페이지의 뒤로가기 버튼(bottom-20 left-4)을 피해 오른쪽에 둔다.
const SHOW_AFTER_PX = 480;

export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="맨 위로 이동"
      className="fixed bottom-20 right-4 z-20 flex h-11 w-11 items-center justify-center  border border-line bg-surface/90 text-lg leading-none text-ink shadow-lg backdrop-blur transition hover:border-accent hover:text-accent active:scale-95 motion-reduce:transition-none sm:right-6"
    >
      <span aria-hidden>↑</span>
    </button>
  );
}
