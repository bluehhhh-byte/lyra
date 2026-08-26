export const IMAGE_PROXY_HOSTS = Object.freeze({
  "image.tmdb.org": ["/t/p/"],
});

export function isAllowedImageProxyUrl(value) {
  try {
    const url = new URL(value);
    const prefixes = IMAGE_PROXY_HOSTS[url.hostname];
    return url.protocol === "https:" && Boolean(prefixes?.some((prefix) => url.pathname.startsWith(prefix)));
  } catch {
    return false;
  }
}
