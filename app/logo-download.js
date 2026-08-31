import FableLogo from "./fable-logo";

// 실제 PNG는 Route Handler가 만든다. 메모리 Blob보다 직접 파일 응답이 모바일 Safari와
// 다운로드 관리자에서 안정적이고, 인스타그램 프로필 규격을 서버에서 고정할 수 있다.
export default function LogoDownload({ section = "lyra" }) {
  const name = section === "cyno" ? "Cyno" : "Lyra";
  const filename = `${section}-instagram-profile-1080.png`;

  return (
    <a
      href={`/downloads/${section}-profile.png`}
      download={filename}
      aria-label={`${name} 인스타그램 프로필 로고 다운로드, PNG 1080×1080`}
      title={`${name} 프로필 로고 다운로드 · PNG 1080×1080`}
      className="group relative flex min-h-11 min-w-11 items-center justify-center text-ink hover:text-accent"
      data-logo-download
    >
      <FableLogo section={section} className="h-7 w-7" />
      <span
        aria-hidden
        className="absolute bottom-0.5 right-0.5 text-[9px] text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        ↓
      </span>
    </a>
  );
}
