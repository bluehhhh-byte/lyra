"use client";

import { useRouter } from "next/navigation";

export default function SongBackButton() {
  const router = useRouter();

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
      className="fixed bottom-20 left-4 z-20 flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface/90 px-4 py-2.5 text-sm font-medium text-ink shadow-lg backdrop-blur transition hover:border-accent hover:text-accent active:scale-95 motion-reduce:transition-none sm:left-6"
    >
      <span aria-hidden className="text-lg leading-none">←</span>
      <span>뒤로</span>
    </button>
  );
}
