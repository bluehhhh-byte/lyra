"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 페이지 첫 화면에서는 보이지 않는다 — 모바일에서 히어로 아래 해설과 겹치는
// 자리(좌하단 고정)라, 처음부터 떠 있으면 글을 가린다. 스크롤해 내려가 뒤로
// 갈 필요가 생기는 지점부터 띄운다. 맨 위로 버튼(scroll-top-button)과 같은 패턴.
const SHOW_AFTER_PX = 320;

export default function SongBackButton() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goBack = () => {
    let cameFromLyra = false;
    try {
      cameFromLyra = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
    } catch {}

    if (cameFromLyra && window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="이전 화면으로 돌아가기"
      className={`fixed bottom-20 left-4 z-20 flex min-h-11 items-center gap-2  border border-line bg-surface/90 px-4 py-2.5 text-sm font-medium text-ink shadow-lg backdrop-blur transition hover:border-accent hover:text-accent active:scale-95 motion-reduce:transition-none sm:left-6 ${visible ? "" : "hidden"}`}
    >
      <span aria-hidden className="text-lg leading-none">←</span>
      <span>뒤로</span>
    </button>
  );
}
