const EXACT_HOSTS = new Set([
  "is1-ssl.mzstatic.com",
  "cdn-images.dzcdn.net",
  "image.bugsm.co.kr",
  "coverartarchive.org",
  "i.scdn.co",
  "image.genie.co.kr",
  "i1.sndcdn.com",
  "i.ytimg.com",
]);

export function isTrustedArtworkUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && (EXACT_HOSTS.has(url.hostname)
        || url.hostname.endsWith(".archive.org")
        || /^ia\d+\.us\.archive\.org$/.test(url.hostname));
  } catch {
    return false;
  }
}

// 캐러셀은 외부 이미지를 canvas에 그린 뒤 PNG로 내보낸다. Bugs 등 일부 CDN은
// 이미지는 정상 표시하면서도 CORS 헤더를 주지 않아 canvas에서만 실패한다.
// 검증된 호스트만 같은 출처 프록시로 읽으면 모든 커버가 동일한 계약을 갖는다.
export function carouselArtworkSrc(value) {
  return isTrustedArtworkUrl(value)
    ? `/api/artwork?url=${encodeURIComponent(value)}`
    : "";
}
