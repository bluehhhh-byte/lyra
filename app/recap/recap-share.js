"use client";

export default function RecapShare({ recap, label }) {
  const share = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0d0d0f";
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = "#c8b6ff";
    ctx.fillRect(72, 72, 8, 1206);
    ctx.fillStyle = "#ededf0";
    ctx.font = "700 72px Pretendard, sans-serif";
    ctx.fillText(label, 130, 190);
    ctx.font = "600 34px Pretendard, sans-serif";
    ctx.fillStyle = "#8a8a94";
    ctx.fillText("CULTURE RECAP", 132, 245);

    const metrics = [
      ["기록한 날", `${recap.days}일`],
      ["음악", `${recap.songs}곡`],
      ["영화·드라마", `${recap.movies}편`],
      ["대표 감정", recap.emotion || "—"],
    ];
    metrics.forEach(([name, value], index) => {
      const x = 132 + (index % 2) * 430;
      const y = 410 + Math.floor(index / 2) * 180;
      ctx.fillStyle = "#ededf0";
      ctx.font = "700 54px Pretendard, sans-serif";
      ctx.fillText(value, x, y);
      ctx.fillStyle = "#8a8a94";
      ctx.font = "26px Pretendard, sans-serif";
      ctx.fillText(name, x, y + 42);
    });

    ctx.fillStyle = "#ededf0";
    ctx.font = "600 30px Pretendard, sans-serif";
    ctx.fillText("많이 들은 가수", 132, 820);
    ctx.fillStyle = "#8a8a94";
    ctx.font = "30px Pretendard, sans-serif";
    recap.artists.forEach(([artist, count], index) => ctx.fillText(`${index + 1}. ${artist}  ${count}곡`, 132, 880 + index * 52));

    ctx.fillStyle = "#ededf0";
    ctx.font = "600 30px Pretendard, sans-serif";
    ctx.fillText("키워드", 600, 820);
    ctx.fillStyle = "#8a8a94";
    ctx.font = "28px Pretendard, sans-serif";
    recap.keywords.forEach(([keyword], index) => ctx.fillText(`#${keyword}`, 600, 880 + index * 44));

    ctx.fillStyle = "#ededf0";
    ctx.font = "600 34px Georgia, serif";
    ctx.fillText("Lyra. / Syno.", 132, 1220);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const file = new File([blob], `lyra-recap-${recap.period}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `${label} 문화 결산` }); } catch {}
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button onClick={share} className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-accent">
      결산 카드 공유
    </button>
  );
}
