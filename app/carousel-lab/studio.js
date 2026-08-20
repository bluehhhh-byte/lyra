"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { autoSelect, buildCarousel, LYRIC_PARTS } from "../../lib/carousel";

const ROLE_COPY = {
  cover: { eyebrow: "01 · COVER", title: "앨범 커버" },
  about: { eyebrow: "02 · ABOUT", title: "곡 설명" },
  lyrics: { eyebrow: "LYRICS", title: "가사" },
};

function Dots({ active, count = 5 }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${active + 1}/${count}장`}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={`h-1 rounded-full transition-all ${index === active ? "w-6 bg-white" : "w-1.5 bg-white/35"}`}
        />
      ))}
    </div>
  );
}

function CoverSlide({ song, index, count }) {
  return (
    <article className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-[#101014] text-white shadow-2xl shadow-black/35">
      <Image src={song.artwork} alt="" fill sizes="(max-width: 768px) 92vw, 460px" unoptimized className="scale-125 object-cover opacity-35 blur-2xl" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-[#101014]/35 to-[#101014]" />
      <div className="relative flex h-full flex-col p-[7%]">
        <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.2em] text-white/65">
          <span>{ROLE_COPY.cover.eyebrow}</span>
          <span className="font-serif text-base normal-case tracking-normal text-white">Lyra.</span>
        </div>

        <div className="mx-auto mt-[7%] aspect-square w-[62%] overflow-hidden rounded-md shadow-2xl shadow-black/60">
          <Image src={song.artwork} alt={`${song.title} 앨범 커버`} width={620} height={620} unoptimized className="h-full w-full object-cover" priority />
        </div>

        <div className="mt-auto">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
            {[song.album, song.year].filter(Boolean).join(" · ")}
          </p>
          <h2 className="mt-2 font-serif text-[clamp(1.35rem,5vw,2rem)] font-semibold leading-tight">{song.title}</h2>
          <p className="mt-1 text-sm text-white/65">{song.artist}</p>
          <div className="mt-6 flex items-end justify-between">
            <div className="flex gap-1.5 text-[9px] text-white/55">
              {[song.genre, song.emotion].filter(Boolean).map((tag) => <span key={tag} className="rounded-full border border-white/15 px-2 py-1">{tag}</span>)}
            </div>
            <Dots active={index} count={count} />
          </div>
        </div>
      </div>
    </article>
  );
}

// 2장 — 곡 설명. 해설은 923곡 전부에 있는 자산이라 제 장을 준다.
function AboutSlide({ song, index, count }) {
  return (
    <article className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-[#111115] text-white shadow-2xl shadow-black/35">
      <Image src={song.artwork} alt="" fill sizes="(max-width: 768px) 92vw, 460px" unoptimized className="scale-150 object-cover opacity-20 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-[#111115]/80 to-black/90" />
      <div className="relative flex h-full flex-col p-[8%]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-white/48">{ROLE_COPY.about.eyebrow}</p>
            <p className="mt-1 text-[11px] text-white/35">{ROLE_COPY.about.title}</p>
          </div>
          <span className="font-serif text-base font-semibold">Lyra.</span>
        </div>
        <p className="my-auto font-serif text-[clamp(1rem,3.6vw,1.4rem)] font-light leading-[1.75] text-white/92">
          {song.comment}
        </p>
        <div className="flex items-end justify-between border-t border-white/10 pt-4">
          <div className="min-w-0 pr-4">
            <p className="truncate text-xs font-semibold">{song.title}</p>
            <p className="mt-0.5 truncate text-[10px] text-white/42">{song.artist}</p>
          </div>
          <Dots active={index} count={count} />
        </div>
      </div>
    </article>
  );
}

function LyricsSlide({ song, slide, index, count, showTranslation, eyebrow }) {
  return (
    <article className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-[#111115] text-white shadow-2xl shadow-black/35">
      <Image src={song.artwork} alt="" fill sizes="(max-width: 768px) 92vw, 460px" unoptimized className="scale-150 object-cover opacity-20 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-[#111115]/80 to-black/90" />
      <div className="relative flex h-full flex-col p-[8%]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-white/48">{eyebrow}</p>
            <p className="mt-1 text-[11px] text-white/35">{slide.label}</p>
          </div>
          <span className="font-serif text-base font-semibold">Lyra.</span>
        </div>

        <div className="my-auto space-y-5">
          {slide.lines.map((line, lineIndex) => (
            <div key={`${line.en}-${lineIndex}`}>
              <p className="font-serif text-[clamp(1rem,3.8vw,1.45rem)] font-semibold leading-[1.28] text-white">
                {line.en}
              </p>
              {showTranslation && line.ko && (
                <p className="mt-1.5 font-batang text-[clamp(0.72rem,2.7vw,0.92rem)] leading-relaxed text-white/52">{line.ko}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-end justify-between border-t border-white/10 pt-4">
          <div className="min-w-0 pr-4">
            <p className="truncate text-xs font-semibold">{song.title}</p>
            <p className="mt-0.5 truncate text-[10px] text-white/42">{song.artist}</p>
          </div>
          <Dots active={index} count={count} />
        </div>
      </div>
    </article>
  );
}

function Miniature({ song, slide, index, active, onClick }) {
  return (
    <button onClick={onClick} aria-label={`${index + 1}장 보기: ${slide.label}`} aria-current={active ? "true" : undefined} className="group min-w-0 text-left">
      <div className={`relative aspect-[4/5] overflow-hidden rounded-xl border-2 transition ${active ? "border-accent" : "border-transparent opacity-55 hover:opacity-90"}`}>
        <Image src={song.artwork} alt="" fill sizes="110px" unoptimized className={`object-cover ${slide.role === "cover" ? "" : "scale-125 opacity-45 blur-sm"}`} />
        <div className={`absolute inset-0 ${slide.role === "cover" ? "bg-gradient-to-t from-black/80 to-transparent" : "bg-black/55"}`} />
        <span className="absolute left-2 top-2 text-[9px] font-bold text-white">0{index + 1}</span>
        <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-[9px] font-semibold leading-tight text-white">{slide.role === "cover" ? song.title : slide.lines[0]?.en}</span>
      </div>
      <p className={`mt-1.5 truncate text-[10px] ${active ? "text-accent" : "text-muted"}`}>{slide.label}</p>
    </button>
  );
}

export default function CarouselStudio({ songs }) {
  const [songIndex, setSongIndex] = useState(0);
  const song = songs[songIndex];
  // 실을 가사 — 첫 줄부터 아홉 줄이 기본(세 장 × 세 줄). 체크박스로 바꾼다.
  const [selIdx, setSelIdx] = useState(() => (song ? new Set(autoSelect(song.lines, 0, 9)) : new Set()));
  const [active, setActive] = useState(0);
  const [showTranslation, setShowTranslation] = useState(true);
  const [copied, setCopied] = useState(false);

  const selected = useMemo(
    () => (song ? song.lines.filter((_, i) => selIdx.has(i)) : []),
    [song, selIdx]
  );
  const carousel = useMemo(
    () => (song ? buildCarousel({ selected, note: song.comment }) : { slides: [], error: "곡이 없습니다" }),
    [song, selected]
  );
  const count = carousel.slides.length;

  useEffect(() => {
    if (!song) return;
    setSelIdx(new Set(autoSelect(song.lines, 0, 9)));
    setActive(0);
  }, [song]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "ArrowLeft") setActive((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight") setActive((value) => Math.min(count - 1, value + 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count]);

  if (!song || carousel.error || count < 3) {
    return <div className="py-24 text-center text-sm text-muted">캐러셀 예시를 만들 수 있는 곡이 없습니다.</div>;
  }

  const slide = carousel.slides[Math.min(active, count - 1)];
  const eyebrowOf = (item, index) =>
    item.role === "lyrics" ? `0${index + 1} · LYRICS` : ROLE_COPY[item.role].eyebrow;

  const copyPlan = async () => {
    const text = carousel.slides.map((item, index) => {
      if (item.role === "cover") return `${index + 1}장 · 커버\n${song.title} — ${song.artist}`;
      if (item.role === "about") return `${index + 1}장 · 곡 설명\n${song.comment}`;
      return `${index + 1}장 · ${item.label}\n${item.lines.map((line) => `${line.en}${line.ko ? `\n${line.ko}` : ""}`).join("\n\n")}`;
    }).join("\n\n———\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const toggleLine = (i) =>
    setSelIdx((old) => {
      const next = new Set(old);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="pb-20 pt-10 sm:pt-16">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Instagram Carousel Lab</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold leading-tight sm:text-5xl">커버가 열고, 설명이 잇고,<br />가사가 세 장을 채운다.</h1>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted sm:text-base">1장은 앨범 커버, 2장은 곡 설명, 3~5장은 고른 가사입니다. 가사는 고르기만 하면 세 장에 고르게 나뉩니다.</p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)] lg:items-start">
        <section className="order-2 rounded-3xl border border-line bg-surface/45 p-4 sm:p-6 lg:order-1" aria-label="캐러셀 설정">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-semibold text-ink">콘텐츠 설정</p><p className="mt-1 text-xs text-muted">실제 보유 곡 데이터 사용</p></div>
            <span className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent">PROTOTYPE</span>
          </div>

          <label className="mt-6 block text-xs font-semibold text-muted" htmlFor="carousel-song">곡 선택</label>
          <select id="carousel-song" value={songIndex} onChange={(event) => setSongIndex(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-line bg-bg px-3 py-3 text-sm text-ink">
            {songs.map((item, index) => <option key={item.slug} value={index}>{item.title} — {item.artist}</option>)}
          </select>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted">실을 가사</p>
              <span className="text-[10px] text-muted">{selIdx.size}줄 → {LYRIC_PARTS}장에 자동 배분</span>
            </div>
            <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-line bg-bg p-3">
              {song.lines.map((line, i) => (
                <li key={i}>
                  {line.section && (
                    <p className="mb-0.5 mt-2 text-[9px] font-semibold uppercase tracking-widest text-accent/70">{line.section}</p>
                  )}
                  <label className="flex cursor-pointer items-baseline gap-2 text-xs">
                    <input type="checkbox" checked={selIdx.has(i)} onChange={() => toggleLine(i)} className="translate-y-0.5 accent-(--color-accent)" />
                    <span className={`truncate ${selIdx.has(i) ? "" : "text-muted"}`}>{line.en}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-xl border border-line px-3 py-3">
            <div><p className="text-xs font-semibold">번역 함께 보기</p><p className="mt-0.5 text-[10px] text-muted">가사 장에서 원문 아래에 표시</p></div>
            <button onClick={() => setShowTranslation((value) => !value)} role="switch" aria-checked={showTranslation} className={`relative h-6 w-11 rounded-full transition ${showTranslation ? "bg-accent" : "bg-line"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${showTranslation ? "left-6" : "left-1"}`} /></button>
          </div>

          <div className="mt-6 grid grid-cols-5 gap-2">
            {carousel.slides.map((item, index) => <Miniature key={`${item.role}-${index}`} song={song} slide={item} index={index} active={active === index} onClick={() => setActive(index)} />)}
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button onClick={copyPlan} className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-bg transition active:scale-[0.98]">{copied ? "구성 복사됨 ✓" : `${count}장 구성 복사`}</button>
            <Link href={`/songs/${encodeURIComponent(song.slug)}`} className="rounded-xl border border-line px-4 py-3 text-center text-sm text-muted transition hover:border-accent hover:text-accent">원래 곡 페이지 보기</Link>
          </div>
        </section>

        <section className="order-1 lg:order-2" aria-label="현재 슬라이드 미리보기" aria-live="polite">
          {slide.role === "cover" ? (
            <CoverSlide song={song} index={active} count={count} />
          ) : slide.role === "about" ? (
            <AboutSlide song={song} index={active} count={count} />
          ) : (
            <LyricsSlide song={song} slide={slide} index={active} count={count} showTranslation={showTranslation} eyebrow={eyebrowOf(slide, active)} />
          )}
          <div className="mt-4 flex items-center justify-between">
            <button onClick={() => setActive((value) => Math.max(0, value - 1))} disabled={active === 0} className="rounded-full border border-line px-4 py-2 text-xs text-muted disabled:opacity-30">← 이전</button>
            <p className="text-xs tabular-nums text-muted"><strong className="text-ink">0{active + 1}</strong> / 0{count} · {slide.label}</p>
            <button onClick={() => setActive((value) => Math.min(count - 1, value + 1))} disabled={active === count - 1} className="rounded-full border border-line px-4 py-2 text-xs text-muted disabled:opacity-30">다음 →</button>
          </div>
        </section>
      </div>

      <section className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {[
          ["01", "인지", "앨범 아트가 그리드의 썸네일이 되어 곡을 즉시 식별합니다."],
          ["02", "설명", "곡 해설이 제 장을 갖습니다 — 다른 가사 계정이 갖지 못한 자산입니다."],
          ["03–05", "가사", "고른 구절이 세 장에 고르게 나뉘어 끝까지 넘기게 합니다."],
        ].map(([number, title, body]) => <div key={number} className="bg-bg p-5"><p className="text-[10px] font-bold tracking-widest text-accent">{number}</p><h2 className="mt-3 text-sm font-semibold">{title}</h2><p className="mt-2 text-xs leading-relaxed text-muted">{body}</p></div>)}
      </section>
    </div>
  );
}
