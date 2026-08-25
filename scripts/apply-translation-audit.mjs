import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const replacements = {
  "l-arc-en-ciel-瞳の住人": [
    ["> 곁에 있어 줘 계속, 너의 미소를 바라보고 싶어", "> 곁에 있어 줘 계속, 너의 미소를 바라보고 싶어", 1],
  ],
  "mac-ayres-i-ll-be-your-home-now": [
    ["> 많은 걸 바라는 걸까,", "> 많은 걸 바라는 걸까", 1],
  ],
  "arco-happy-new-year": [
    ["> 꼭 붙잡은 채 수 많은 사람들이 기원한다", "> 꼭 붙잡은 채 수많은 사람들이 기원한다", 1],
  ],
  "glay-missing-you": [
    ["> 목소리를 들려줘 언제나처럼", "> 목소리를 들려줘, 언제나처럼", 1],
    ["> 지금은 아직 용서없이 휘몰아치는 바람에", "> 지금은 아직 용서 없이 휘몰아치는 바람에", 1],
  ],
  "valley-the-problem-song": [
    ["> 우리가 다시 시작할 수 있을거래", "> 우리가 다시 시작할 수 있을 거래", 1],
    ["> 우린 고칠 수 있을거야", "> 우린 고칠 수 있을 거야", 1],
  ],
  "bon-jovi-this-ain-t-a-love-song": [
    ["> 그럼 내가 틀린 거야, 그래, 나는 틀린거야", "> 그럼 내가 틀린 거야, 그래, 나는 틀린 거야", 1],
  ],
  "dir-en-grey-理由-이유": [
    ["> 이 이상은 더 이상은 상처 받고 싶지 않아", "> 이 이상은 더 이상은 상처받고 싶지 않아", 1],
  ],
  "chemistry-piece-of-a-dream": [
    ["> 손끝으로 느끼고나서야 느끼는 그리운 아픔이", "> 손끝으로 느끼고 나서야 느끼는 그리운 아픔이", 1],
  ],
  "kirinji-aliens": [
    ["> 마법을 걸어보이겠어", "> 마법을 걸어 보이겠어", 1],
  ],
  "phoenix-love-for-granted": [
    ["> 작은 기회라도 준다면 너의 제안을 받아들일게", "> 작은 기회라도 준다면, 너의 제안을 받아들일게", 1],
    [">^3 말하지 말아 줘, 너의 거짓말들", ">^2 말하지 말아 줘, 너의 거짓말들", 1],
  ],
  "nafla-adrenaline": [
    ["> 너희들을 전부 다", "> 너희들을 전부 다 먹어치워", 4],
  ],
  "prince-bernald-i-want-a-man": [
    ["> 내가 그런 남자가, 남자가 되길", "> 그런 남자를 원해, 남자를 말야", 2],
  ],
  "새소년-긴-꿈": [
    ["> I want to shoot a movie with you", "> 너와 함께 영화를 찍고 싶어", 2],
    ["> Hold your hand and walk, run, fly with you", "> 네 손을 잡고 걷고, 달리고, 너와 날고 싶어", 2],
    ["> Why am I blooming when I look at you", "> 왜 너를 바라보면 내가 피어날까", 2],
    ["> I can change the world to be with you", "> 너와 함께라면 세상을 바꿀 수 있어", 2],
    ["> So take my hand and walk run fly with you", "> 그러니 내 손을 잡고 함께 걷고, 달리고, 날아가자", 2],
  ],
  "henry-young-ashley-alisha-one-more-last-time": [
    ["> One more last time", "> 마지막으로 한 번만 더", 2],
  ],
  "검정치마-폭죽과-풍선들": [
    ["> Oh, look at 'em go baby go", "> 오, 저것들 날아가는 것 좀 봐, 자 가자", 1],
  ],
  "오존-clouds": [
    ["> Maybe I'll make you feel good", "> 어쩌면 내가 널 기분 좋게 해줄지도 몰라", 2],
  ],
  "rude-john-find-your-love": [
    ["> Find your love", "> 너의 사랑을 찾아", 8],
  ],
  "아일릿-빌려온-고양이": [
    ["> So curious", "> 너무 궁금해", 2],
    ["> So fabulous", "> 너무 멋져", 1],
    ["> Like a roller coaster ride", "> 롤러코스터를 타는 것처럼", 2],
    ["> My heart starts to", "> 내 심장이 움직이기 시작해", 1],
    ["> Do you wanna dance?", "> 춤추고 싶어?", 2],
  ],
};

let auditedLines = 0;
let changedLines = 0;
for (const [slug, rules] of Object.entries(replacements)) {
  const file = path.join("songs", `${slug}.md`);
  const before = fs.readFileSync(file, "utf8");
  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  let lines = before.replace(/\r\n/g, "\n").split("\n");
  for (const [from, to, expected] of rules) {
    const oldCount = lines.filter((line) => line.trimEnd() === from).length;
    const fixedCount = lines.filter((line) => line.trimEnd() === to).length;
    if (oldCount) assert.equal(oldCount, expected, `${file}: ${JSON.stringify(from)} 교정 대상 수가 다릅니다`);
    else assert.ok(fixedCount >= expected, `${file}: ${JSON.stringify(to)} 교정 결과가 없습니다`);
    lines = lines.map((line) => line.trimEnd() === from ? to : line);
    auditedLines += expected;
    changedLines += oldCount;
  }
  fs.writeFileSync(file, lines.join(eol));
}

const greenDay = "songs/green-day-last-night-on-earth.md";
const greenBefore = fs.readFileSync(greenDay, "utf8");
const oldBlock = [
  "> 내가 가진 모든 숨결마다",
  "> 내 모든 사랑을 너에게 보내기 위해",
  "> 난 이 땅 위에 서 있어",
].join("\n");
const newBlock = [
  "> 내가 가진 모든 숨결마다",
  "> 난 이 땅 위에 서 있어",
  "> 내 모든 사랑을 너에게 보낼 거야",
].join("\n");
const normalizedGreen = greenBefore.replace(/\r\n/g, "\n");
const oldGreenCount = normalizedGreen.split(oldBlock).length - 1;
const fixedGreenCount = normalizedGreen.split(newBlock).length - 1;
assert.equal(oldGreenCount + fixedGreenCount, 1, `${greenDay}: 감사할 번역 블록이 다릅니다`);
fs.writeFileSync(greenDay, normalizedGreen.replace(oldBlock, newBlock).replace(/\n/g, greenBefore.includes("\r\n") ? "\r\n" : "\n"));
auditedLines += 2;
changedLines += oldGreenCount * 2;

console.log(JSON.stringify({ files: Object.keys(replacements).length + 1, auditedLines, changedLines }));
console.log("translation audit fixes applied");
