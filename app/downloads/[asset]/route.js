import { ImageResponse } from "next/og";

const SIZE = 1080;

export async function GET(_request, { params }) {
  const { asset } = await params;
  const section = String(asset || "").startsWith("cyno") ? "cyno" : "lyra";
  const accent = section === "cyno" ? "#d6b26c" : "#c8b6ff";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#12100e",
        }}
      >
        <svg width="900" height="900" viewBox="0 0 1080 1080" aria-label={`${section} profile mark`}>
          {/* 화면의 엔소와 같은 열린 원. 16% 안전 여백 안에 있어 인스타 원형 크롭에도 남는다. */}
          <path
            d="M 804 760 C 706 878 457 902 287 779 C 116 656 126 383 286 257 C 444 132 696 167 812 319"
            fill="none"
            stroke="#eee7d2"
            strokeWidth="62"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 790 748 C 682 845 471 866 316 757 C 164 650 164 409 305 291 C 446 174 677 194 790 327"
            fill="none"
            stroke="#eee7d2"
            strokeOpacity="0.22"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {/* 중앙의 일곱 갈래 불꽃. 작은 프로필에서도 심벌의 초점이 사라지지 않는다. */}
          {[0, 1, 2, 3, 4, 5, 6].map((index) => {
            const angle = -Math.PI / 2 + (index / 7) * Math.PI * 2;
            const inner = 28;
            const outer = index % 2 ? 92 : 116;
            return (
              <line
                key={index}
                x1={540 + Math.cos(angle) * inner}
                y1={540 + Math.sin(angle) * inner}
                x2={540 + Math.cos(angle) * outer}
                y2={540 + Math.sin(angle) * outer}
                stroke={accent}
                strokeWidth="17"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      headers: {
        "Content-Disposition": `attachment; filename="${section}-instagram-profile-1080.png"`,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    }
  );
}
