"use client";

import { useEffect } from "react";

export default function AdminError({ error, reset }) {
  useEffect(() => {
    console.error(JSON.stringify({
      level: "error",
      msg: "admin_segment_render_failed",
      digest: error?.digest || "",
    }));
  }, [error]);

  return (
    <section className="mx-auto max-w-xl  border border-line bg-surface p-6 text-center sm:p-8" role="alert">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Lyra admin</p>
      <h1 className="mt-3 text-xl font-bold">관리자 화면을 불러오지 못했습니다.</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        입력하거나 저장한 데이터가 삭제된 것은 아닙니다. 잠시 후 다시 시도해 주세요.
      </p>
      {error?.digest && (
        <p className="mt-2 text-xs text-muted/70">오류 코드: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className=" ink-action px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98]"
        >
          다시 시도
        </button>
        <button
          type="button"
          onClick={() => location.reload()}
          className=" border border-line px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-accent"
        >
          새로고침
        </button>
        <a href="/" className=" border border-line px-4 py-2 text-sm text-muted transition hover:text-accent">
          홈으로
        </a>
      </div>
    </section>
  );
}
