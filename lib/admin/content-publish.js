export function parsePublishTargets(args, { dataAllowlist = [] } = {}) {
  const allowedData = new Set(dataAllowlist);
  const targets = [];
  for (const arg of args || []) {
    const match = String(arg).match(/^--(song|movie|data)=(.+)$/);
    if (!match) throw new Error(`알 수 없는 인자: ${arg}`);
    const [, type, name] = match;
    if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(name) || name.includes(".."))
      throw new Error(`잘못된 대상 이름: ${name}`);
    if (type === "data" && !allowedData.has(name)) throw new Error(`허용되지 않은 data 파일: ${name}`);
    targets.push(type === "data"
      ? { type, name, relativePath: `data/${name}` }
      : { type, slug: name, relativePath: `${type === "song" ? "songs" : "movies"}/${name}.md` });
  }
  const unique = [...new Map(targets.map((target) => [`${target.type}:${target.name || target.slug}`, target])).values()];
  if (!unique.length) throw new Error("반영할 대상을 --song=slug, --movie=slug, --data=file.json 중 하나로 지정하세요");
  return unique;
}
