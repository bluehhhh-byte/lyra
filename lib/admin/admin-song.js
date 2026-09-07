export function toAdminSong(song = {}) {
  const stanzas = Array.isArray(song.stanzas) ? song.stanzas : [];
  const hasTranslation = stanzas.some((stanza) =>
    (Array.isArray(stanza?.lines) ? stanza.lines : []).some((line) => Boolean(line?.ko))
  );

  return {
    slug: String(song.slug || ""),
    title: String(song.title || "(제목 없음)"),
    title_ko: String(song.title_ko || ""),
    artist: String(song.artist || "(아티스트 없음)"),
    artist_ko: String(song.artist_ko || ""),
    album: String(song.album || ""),
    tags: Array.isArray(song.tags) ? song.tags.map(String) : [],
    searchAliases: Array.isArray(song.search_aliases) ? song.search_aliases.map(String) : [],
    artwork: typeof song.artwork === "string" ? song.artwork : "",
    comment: typeof song.comment === "string" ? song.comment : "",
    // 커버 카드의 "이런 순간에" 한 줄. 목록에서 바로 읽혀야 어떤 곡이 어떤 문구를
    // 달고 있는지 훑어보고 고칠 곳을 찾는다.
    listenWhen: typeof song.listen_when === "string" ? song.listen_when : "",
    hasTranslation,
  };
}
