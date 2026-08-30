"use client";

import "./globals.css";

export default function GlobalError({ reset }) {
  return (
    <html lang="ko">
      <body className="font-sans min-h-screen bg-bg text-ink">
        <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-16">
          <section className="w-full  border border-line bg-surface p-6 text-center sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Lyra</p>
            <h1 className="mt-3 text-2xl font-bold">페이지를 불러오지 못했습니다</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">잠시 뒤 다시 시도해 주세요. 작성 중인 내용이 있다면 브라우저를 닫지 마세요.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={reset} className=" ink-action px-4 py-2.5 text-sm font-semibold text-bg">다시 시도</button>
              <a href="/" className=" border border-line px-4 py-2.5 text-sm font-semibold">홈으로</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
