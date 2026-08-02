import fs from "node:fs";

// 왓챠피디아 별점 목록에서 {code, rating}을 긁어 화면에 띄우는 북마클릿.
// 다운로드는 스크롤 대기(await) 뒤라 크롬이 user-gesture 만료로 막는 일이 있어
// textarea에 담아 자동 선택한다.
//
// String.raw 로 감싸서 정규식의 \s \d \n 이 그대로 살아남게 한다 —
// 일반 템플릿 리터럴이면 \s 가 s 로 먹혀 정규식이 조용히 망가진다.
const src = String.raw`
(async()=>{
if(!location.pathname.includes('/contents/')){
 alert('여기는 타입을 고르는 목차 페이지입니다.\n\n영화 / 시리즈 / 책 중 하나를 클릭해 목록으로 들어간 뒤 다시 눌러주세요.\n(주소에 /contents/ 가 들어가야 합니다)');return;}
const old=document.getElementById('wxbox');if(old)old.remove();
const S=m=>new Promise(r=>setTimeout(r,m));
const tip=document.createElement('div');
tip.style.cssText='position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:8px;font:14px system-ui;box-shadow:0 4px 20px rgba(0,0,0,.4)';
tip.textContent='왓챠 내보내기: 스크롤 중…';document.body.appendChild(tip);
const N=()=>document.querySelectorAll('a[href*="/contents/"]').length;
let st=0,prev=N();
for(let i=0;i<900&&st<5;i++){
 const list=document.querySelectorAll('a[href*="/contents/"]');
 const last=list[list.length-1];
 if(last)last.scrollIntoView({block:'end'});
 scrollTo(0,document.documentElement.scrollHeight||document.body.scrollHeight);
 await S(700);
 const n=N();
 st=n===prev?st+1:0;prev=n;
 tip.textContent='왓챠 내보내기: 스크롤 중… '+n+'개';}
scrollTo(0,0);await S(300);
const rows=new Map();
for(const a of document.querySelectorAll('a[href*="/contents/"]')){
 const href=a.getAttribute('href')||'';
 const code=(href.split('/contents/')[1]||'').split(/[/?#]/)[0]||'';
 if(!code)continue;
 // 별점·제목은 반드시 이 카드(a 또는 그 li) 안에서만 읽는다. 섹션 위로 올라가면
 // 카드가 전부 든 컨테이너라 첫 카드의 별점이 모두에게 복사된다(그 버그였다).
 const card=a.closest('li')||a;
 const T=card.innerText||'';
 // 제목: 전용 클래스가 가장 정확. 왓챠가 제목 칸에 줄거리를 넣어둔 항목은
 // 40자 넘고 콜론이 있으면 콜론 앞만('조커: 폴리 아 되'는 40자 이하라 안전).
 const tEl=card.querySelector('[class*=contentTitle]');
 let title=((tEl?tEl.innerText:T)||'').trim().split('\n')[0]||'';
 if(title.length>40&&title.includes(':'))title=title.split(':')[0].trim();
 // '평가함 ★ 4.5' — 이 카드 안의 별점
 const star=T.match(/★\s*([\d.]+)/);
 const yr=T.match(/[・·]\s*(\d{4})/);
 const kind=code[0]==='m'?'movies':code[0]==='t'?'tv_seasons':code[0]==='b'?'books':code[0]==='w'?'webtoons':'';
 const p=rows.get(code)||{code:code,type:kind,title:'',year:'',rating:null};
 if(title&&!p.title)p.title=title;
 if(yr&&!p.year)p.year=yr[1];
 if(star&&p.rating==null){const v=+star[1];if(v>0&&v<=5)p.rating=v;}
 rows.set(code,p);}
tip.remove();
const items=[...rows.values()].filter(x=>x.rating!=null);
if(!items.length){alert('별점을 못 찾았습니다.\n\n① 로그인 상태인지\n② "별점" 목록 페이지인지 확인하세요.\n주소: /contents/movies/ratings (뒤에 ?type=byStar 는 빼세요)');return;}
const json=JSON.stringify(items,null,2);
const box=document.createElement('div');box.id='wxbox';
box.style.cssText='position:fixed;z-index:2147483647;inset:5% 10%;background:#16161a;color:#ededf0;border:1px solid #333;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;font:14px system-ui;box-shadow:0 10px 50px rgba(0,0,0,.6)';
const head=document.createElement('div');
head.innerHTML='<b>'+items.length+'개 추출 완료</b> &nbsp;<span style="opacity:.7">복사 후 관리자 &gt; 영화 관리 &gt; 왓챠피디아 가져오기에 붙여넣기</span>';
const ta=document.createElement('textarea');ta.value=json;
ta.style.cssText='flex:1;width:100%;background:#0d0d0f;color:#ededf0;border:1px solid #333;border-radius:8px;padding:10px;font:12px ui-monospace,monospace;resize:none';
const bar=document.createElement('div');bar.style.cssText='display:flex;gap:8px';
const mk=(t,f)=>{const b=document.createElement('button');b.textContent=t;
 b.style.cssText='flex:1;padding:14px;border-radius:8px;border:1px solid #444;background:#222;color:#ededf0;cursor:pointer;font:15px system-ui';
 b.onclick=f;return b;};
// 모바일은 execCommand가 불안정 — clipboard API 우선, 실패 시 execCommand.
const done=()=>{head.querySelector('b').textContent='복사됨! 관리자에 붙여넣으세요';};
bar.appendChild(mk('복사',async()=>{
 try{await navigator.clipboard.writeText(json);done();}
 catch{ta.focus();ta.select();ta.setSelectionRange(0,json.length);
  try{document.execCommand('copy');done();}catch{head.querySelector('b').textContent='길게 눌러 전체 선택 후 복사하세요';}}}));
bar.appendChild(mk('파일로 저장',()=>{const el=document.createElement('a');
 el.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
 el.download='watcha-'+items.length+'.json';document.body.appendChild(el);el.click();
 setTimeout(()=>{URL.revokeObjectURL(el.href);el.remove();},2000);}));
bar.appendChild(mk('닫기',()=>box.remove()));
box.appendChild(head);box.appendChild(ta);box.appendChild(bar);
document.body.appendChild(box);ta.focus();ta.select();
})();
`;

// 한 줄로 합치므로 `//` 주석 줄은 반드시 버린다 — 남으면 뒤 코드를 전부 삼킨다
const min = src
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("//"))
  .join("");
const url = "javascript:" + encodeURIComponent(min);

// 사용법과 코드를 한 문서에 담아 둔다 — GitHub에서 그대로 복사해 쓸 수 있게.
// 코드를 고쳤으면 `node scripts/watcha-bookmarklet.mjs` 로 이 문서를 다시 만든다.
const doc = `# 왓챠피디아 → Lyra 가져오기 (북마클릿)

왓챠피디아는 공식 API도, 내보내기 기능도 없다. 이 북마클릿은 **내 브라우저에 이미
그려진 목록**을 읽어 JSON으로 만들어 준다. 왓챠 API를 직접 부르지 않으므로 로그인
세션만 있으면 되고, 클라이언트 위조 같은 것도 하지 않는다.

## 1. 북마크 등록 (최초 1회)

### PC (크롬/엣지)
\`Ctrl+Shift+O\` → 우측 상단 ⋮ → **새 북마크 추가**
- 이름: 아무거나 (예: 왓챠 내보내기)
- URL: 맨 아래 \`javascript:\` 로 시작하는 한 줄 전체

이미 등록했으면 그 북마크를 **우클릭 → 수정**해서 URL만 교체한다.

### 모바일 (엣지/크롬 앱) — 콘솔이 없어 북마클릿이 유일한 방법
모바일은 주소창에 \`javascript:\` 를 붙여넣으면 접두어가 잘리므로, **북마크로
저장해 이름으로 실행**한다.

1. 이 문서의 맨 아래 한 줄(\`javascript:…\`)을 **복사**한다.
   - 깃허브 앱/브라우저에서 코드블록 우측의 복사 아이콘을 누르면 편하다.
2. 아무 페이지나 **북마크에 추가**(⭐)한 뒤, 북마크 목록에서 그 항목을 **편집**:
   - 이름: \`왓챠\` (짧게 — 곧 주소창에 이 이름을 친다)
   - URL: 방금 복사한 \`javascript:…\` 를 **붙여넣기**
   - 엣지: 하단 \`⋯\` → 즐겨찾기 → 항목 옆 \`⋯\` → 편집
   - 크롬: \`⋮\` → 북마크(★) → 항목 → 편집(연필)
3. 왓챠 별점 목록 페이지를 연다(아래 2번 주소).
4. **주소창에 \`왓챠\` 를 치면** 저장한 북마크가 후보로 뜬다 → **탭**하면 실행된다.
   (주소창에서 실행해야 현재 페이지에서 돈다. 북마크 목록에서 열면 안 된다.)
5. 스크롤이 끝나면 뜨는 창의 **[복사]** 버튼 → 관리자에 붙여넣기.

> 안 되면: 크롬 모바일은 북마크-이름 실행이 막힌 버전이 있다. 그럴 땐 **엣지**를
> 쓰거나, PC에서 한 번 뽑아 두는 걸 권한다.

## 2. 반드시 "영화 별점 목록" 페이지에서 누른다

| | 주소 | |
|---|---|---|
| ✗ | \`/ratings\` | 영화 1106 · 시리즈 196 처럼 **개수만** 나오는 목차 |
| ✗ | \`/contents/movies/ratings?type=byStar\` | 별점이 카드에 없고 그룹 헤더에만 있어 잘 안 잡힌다 |
| ✓ | \`/contents/movies/ratings\` | 카드마다 \`평가함 ★ 4.5\` 가 있는 기본 목록 |

- 영화 별점: \`pedia.watcha.com/ko/users/<내코드>/contents/movies/ratings\`
  (뒤에 \`?type=byStar\` 가 붙어 있으면 지운다)

\`<내코드>\` 는 왓챠 프로필 주소에 있다. 뽑히는 건 \`{code, title, year, rating}\` —
별점 병합에 필요한 code·rating만 확실히 담는다(코멘트는 담지 않는다).

## 3. 실행

화면 위에 \`스크롤 중… N개\` 가 뜨고 숫자가 올라간다. 1,100개면 몇 분 걸리니
숫자가 멈추고 결과창이 뜰 때까지 둔다. 결과창의 텍스트는 이미 전체 선택돼 있으니
\`Ctrl+C\`. (다운로드는 스크롤 대기 뒤라 크롬이 막는 일이 있어 화면 표시로 바꿨다.
창 안의 **파일로 저장** 버튼도 남아 있다.)

## 4. 사이트에 반영

관리자 → 영화 관리 → **왓챠피디아 가져오기** 에 붙여넣고 [미리보기] → [반영].

- 체크박스를 끄면 **이미 등록된 작품의 별점·코멘트만** 채운다. 평가 목록 전체를
  붙여넣어도 새 영화가 무더기로 생기지 않는다.
- 매칭되면 \`watcha_code\` 를 파일에 남겨 다음부터는 제목 대조 없이 바로 찾는다.
- 같은 JSON을 다시 넣으면 \`변경 없음\` 이라 여러 번 돌려도 안전하다.

## 뽑히는 형태

\`\`\`json
[{ "code": "mdMRrE2", "type": "movies", "title": "룩백",
   "year": "2024", "rating": 4.5, "comment": "" }]
\`\`\`

---

## 북마클릿 (아래 한 줄 전체 복사)

\`\`\`
${url}
\`\`\`
`;

fs.writeFileSync(new URL("./watcha-bookmarklet.md", import.meta.url), doc);
console.log(`watcha-bookmarklet.md 갱신 · 북마클릿 ${url.length}자`);
