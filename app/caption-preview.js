import { captionPreview, INSTAGRAM_CAPTION_LIMIT } from "../lib/caption";

export default function InstagramCaptionPreview({ text, className = "bg-surface" }) {
  const preview = captionPreview(text);
  return (
    <div>
      <pre className={`max-w-full whitespace-pre-wrap break-words rounded-lg border border-line px-3 py-2 font-sans text-xs leading-relaxed text-ink ${className}`}>{preview.text}</pre>
      <p className="mt-1 text-[11px] text-muted" role="status">
        {preview.characters.toLocaleString("ko-KR")}/{INSTAGRAM_CAPTION_LIMIT.toLocaleString("ko-KR")}자 · {preview.lines}줄 · 해시태그 {preview.hashtags}개
      </p>
      {preview.warnings.map((warning) => <p key={warning} role="alert" className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">{warning}</p>)}
    </div>
  );
}
