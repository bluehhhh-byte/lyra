# 시각 회귀 검사 — 주요 페이지를 390px(모바일)·1280px(데스크톱)로 실제 렌더해
# 가로 스크롤(레이아웃 뚫림)이 생기는지 확인하고 스크린샷을 남긴다.
#   pnpm build && pnpm visual
# 로컬 전용 도구 — Python + playwright(pip install playwright && playwright install chromium)
# 필요. CI(pnpm check)에는 포함하지 않는다: 러너에 브라우저가 없다.
import subprocess, sys, time, urllib.request
from pathlib import Path

PORT = 3299
BASE = f"http://localhost:{PORT}"
OUT = Path(".visual-check")  # gitignored
PAGES = ["/", "/movies", "/songs/taste", "/recommendations/music", "/recommendations", "/watched", "/diary", "/stats", "/admin/login"]
WIDTHS = [390, 1280]

root = Path(__file__).resolve().parent.parent
if not (root / ".next" / "BUILD_ID").exists():
    sys.exit("✗ .next 빌드가 없습니다 — pnpm build 먼저")

server = subprocess.Popen(
    ["node", "node_modules/next/dist/bin/next", "start", "-p", str(PORT)],
    cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE, timeout=2)
            break
        except Exception:
            time.sleep(0.5)
    else:
        sys.exit("✗ next start가 30초 안에 응답하지 않음")

    from playwright.sync_api import sync_playwright

    OUT.mkdir(exist_ok=True)
    failed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in WIDTHS:
            page = browser.new_page(viewport={"width": width, "height": 900})
            for path in PAGES:
                page.goto(BASE + path, wait_until="networkidle")
                overflow = page.evaluate(
                    "document.documentElement.scrollWidth > document.documentElement.clientWidth"
                )
                name = (path.strip("/").replace("/", "-") or "home") + f"-{width}"
                page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
                if overflow:
                    failed += 1
                    print(f"  ✗ {path} @{width}px — 가로 스크롤 발생")
                else:
                    print(f"  ✓ {path} @{width}px")
            page.close()
        browser.close()

    print(f"\n스크린샷: {OUT}/ · " + (f"{failed}개 실패" if failed else "가로 스크롤 없음"))
    sys.exit(1 if failed else 0)
finally:
    server.kill()
