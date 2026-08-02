# 왓챠피디아 → Lyra 가져오기 (북마클릿)

왓챠피디아는 공식 API도, 내보내기 기능도 없다. 이 북마클릿은 **내 브라우저에 이미
그려진 목록**을 읽어 JSON으로 만들어 준다. 왓챠 API를 직접 부르지 않으므로 로그인
세션만 있으면 되고, 클라이언트 위조 같은 것도 하지 않는다.

## 1. 북마크 등록 (최초 1회)

### PC (크롬/엣지)
`Ctrl+Shift+O` → 우측 상단 ⋮ → **새 북마크 추가**
- 이름: 아무거나 (예: 왓챠 내보내기)
- URL: 맨 아래 `javascript:` 로 시작하는 한 줄 전체

이미 등록했으면 그 북마크를 **우클릭 → 수정**해서 URL만 교체한다.

### 모바일 (엣지/크롬 앱) — 콘솔이 없어 북마클릿이 유일한 방법
모바일은 주소창에 `javascript:` 를 붙여넣으면 접두어가 잘리므로, **북마크로
저장해 이름으로 실행**한다.

1. 이 문서의 맨 아래 한 줄(`javascript:…`)을 **복사**한다.
   - 깃허브 앱/브라우저에서 코드블록 우측의 복사 아이콘을 누르면 편하다.
2. 아무 페이지나 **북마크에 추가**(⭐)한 뒤, 북마크 목록에서 그 항목을 **편집**:
   - 이름: `왓챠` (짧게 — 곧 주소창에 이 이름을 친다)
   - URL: 방금 복사한 `javascript:…` 를 **붙여넣기**
   - 엣지: 하단 `⋯` → 즐겨찾기 → 항목 옆 `⋯` → 편집
   - 크롬: `⋮` → 북마크(★) → 항목 → 편집(연필)
3. 왓챠 별점 목록 페이지를 연다(아래 2번 주소).
4. **주소창에 `왓챠` 를 치면** 저장한 북마크가 후보로 뜬다 → **탭**하면 실행된다.
   (주소창에서 실행해야 현재 페이지에서 돈다. 북마크 목록에서 열면 안 된다.)
5. 스크롤이 끝나면 뜨는 창의 **[복사]** 버튼 → 관리자에 붙여넣기.

> 안 되면: 크롬 모바일은 북마크-이름 실행이 막힌 버전이 있다. 그럴 땐 **엣지**를
> 쓰거나, PC에서 한 번 뽑아 두는 걸 권한다.

## 2. 반드시 "영화 별점 목록" 페이지에서 누른다

| | 주소 | |
|---|---|---|
| ✗ | `/ratings` | 영화 1106 · 시리즈 196 처럼 **개수만** 나오는 목차 |
| ✗ | `/contents/movies/ratings?type=byStar` | 별점이 카드에 없고 그룹 헤더에만 있어 잘 안 잡힌다 |
| ✓ | `/contents/movies/ratings` | 카드마다 `평가함 ★ 4.5` 가 있는 기본 목록 |

- 영화 별점: `pedia.watcha.com/ko/users/<내코드>/contents/movies/ratings`
  (뒤에 `?type=byStar` 가 붙어 있으면 지운다)

`<내코드>` 는 왓챠 프로필 주소에 있다. 뽑히는 건 `{code, title, year, rating}` —
별점 병합에 필요한 code·rating만 확실히 담는다(코멘트는 담지 않는다).

## 3. 실행

화면 위에 `스크롤 중… N개` 가 뜨고 숫자가 올라간다. 1,100개면 몇 분 걸리니
숫자가 멈추고 결과창이 뜰 때까지 둔다. 결과창의 텍스트는 이미 전체 선택돼 있으니
`Ctrl+C`. (다운로드는 스크롤 대기 뒤라 크롬이 막는 일이 있어 화면 표시로 바꿨다.
창 안의 **파일로 저장** 버튼도 남아 있다.)

## 4. 사이트에 반영

관리자 → 영화 관리 → **왓챠피디아 가져오기** 에 붙여넣고 [미리보기] → [반영].

- 체크박스를 끄면 **이미 등록된 작품의 별점·코멘트만** 채운다. 평가 목록 전체를
  붙여넣어도 새 영화가 무더기로 생기지 않는다.
- 매칭되면 `watcha_code` 를 파일에 남겨 다음부터는 제목 대조 없이 바로 찾는다.
- 같은 JSON을 다시 넣으면 `변경 없음` 이라 여러 번 돌려도 안전하다.

## 뽑히는 형태

```json
[{ "code": "mdMRrE2", "type": "movies", "title": "룩백",
   "year": "2024", "rating": 4.5, "comment": "" }]
```

---

## 북마클릿 (아래 한 줄 전체 복사)

```
javascript:(async()%3D%3E%7Bif(!location.pathname.includes('%2Fcontents%2F'))%7Balert('%EC%97%AC%EA%B8%B0%EB%8A%94%20%ED%83%80%EC%9E%85%EC%9D%84%20%EA%B3%A0%EB%A5%B4%EB%8A%94%20%EB%AA%A9%EC%B0%A8%20%ED%8E%98%EC%9D%B4%EC%A7%80%EC%9E%85%EB%8B%88%EB%8B%A4.%5Cn%5Cn%EC%98%81%ED%99%94%20%2F%20%EC%8B%9C%EB%A6%AC%EC%A6%88%20%2F%20%EC%B1%85%20%EC%A4%91%20%ED%95%98%EB%82%98%EB%A5%BC%20%ED%81%B4%EB%A6%AD%ED%95%B4%20%EB%AA%A9%EB%A1%9D%EC%9C%BC%EB%A1%9C%20%EB%93%A4%EC%96%B4%EA%B0%84%20%EB%92%A4%20%EB%8B%A4%EC%8B%9C%20%EB%88%8C%EB%9F%AC%EC%A3%BC%EC%84%B8%EC%9A%94.%5Cn(%EC%A3%BC%EC%86%8C%EC%97%90%20%2Fcontents%2F%20%EA%B0%80%20%EB%93%A4%EC%96%B4%EA%B0%80%EC%95%BC%20%ED%95%A9%EB%8B%88%EB%8B%A4)')%3Breturn%3B%7Dconst%20old%3Ddocument.getElementById('wxbox')%3Bif(old)old.remove()%3Bconst%20S%3Dm%3D%3Enew%20Promise(r%3D%3EsetTimeout(r%2Cm))%3Bconst%20tip%3Ddocument.createElement('div')%3Btip.style.cssText%3D'position%3Afixed%3Bz-index%3A2147483647%3Btop%3A12px%3Bleft%3A50%25%3Btransform%3AtranslateX(-50%25)%3Bbackground%3A%23111%3Bcolor%3A%23fff%3Bpadding%3A10px%2016px%3Bborder-radius%3A8px%3Bfont%3A14px%20system-ui%3Bbox-shadow%3A0%204px%2020px%20rgba(0%2C0%2C0%2C.4)'%3Btip.textContent%3D'%EC%99%93%EC%B1%A0%20%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0%3A%20%EC%8A%A4%ED%81%AC%EB%A1%A4%20%EC%A4%91%E2%80%A6'%3Bdocument.body.appendChild(tip)%3Bconst%20N%3D()%3D%3Edocument.querySelectorAll('a%5Bhref*%3D%22%2Fcontents%2F%22%5D').length%3Blet%20st%3D0%2Cprev%3DN()%3Bfor(let%20i%3D0%3Bi%3C900%26%26st%3C5%3Bi%2B%2B)%7Bconst%20list%3Ddocument.querySelectorAll('a%5Bhref*%3D%22%2Fcontents%2F%22%5D')%3Bconst%20last%3Dlist%5Blist.length-1%5D%3Bif(last)last.scrollIntoView(%7Bblock%3A'end'%7D)%3BscrollTo(0%2Cdocument.documentElement.scrollHeight%7C%7Cdocument.body.scrollHeight)%3Bawait%20S(700)%3Bconst%20n%3DN()%3Bst%3Dn%3D%3D%3Dprev%3Fst%2B1%3A0%3Bprev%3Dn%3Btip.textContent%3D'%EC%99%93%EC%B1%A0%20%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0%3A%20%EC%8A%A4%ED%81%AC%EB%A1%A4%20%EC%A4%91%E2%80%A6%20'%2Bn%2B'%EA%B0%9C'%3B%7DscrollTo(0%2C0)%3Bawait%20S(300)%3Bconst%20rows%3Dnew%20Map()%3Bfor(const%20a%20of%20document.querySelectorAll('a%5Bhref*%3D%22%2Fcontents%2F%22%5D'))%7Bconst%20href%3Da.getAttribute('href')%7C%7C''%3Bconst%20code%3D(href.split('%2Fcontents%2F')%5B1%5D%7C%7C'').split(%2F%5B%2F%3F%23%5D%2F)%5B0%5D%7C%7C''%3Bif(!code)continue%3Bconst%20card%3Da.closest('li')%7C%7Ca%3Bconst%20T%3Dcard.innerText%7C%7C''%3Bconst%20tEl%3Dcard.querySelector('%5Bclass*%3DcontentTitle%5D')%3Blet%20title%3D((tEl%3FtEl.innerText%3AT)%7C%7C'').trim().split('%5Cn')%5B0%5D%7C%7C''%3Bif(title.length%3E40%26%26title.includes('%3A'))title%3Dtitle.split('%3A')%5B0%5D.trim()%3Bconst%20star%3DT.match(%2F%E2%98%85%5Cs*(%5B%5Cd.%5D%2B)%2F)%3Bconst%20yr%3DT.match(%2F%5B%E3%83%BB%C2%B7%5D%5Cs*(%5Cd%7B4%7D)%2F)%3Bconst%20kind%3Dcode%5B0%5D%3D%3D%3D'm'%3F'movies'%3Acode%5B0%5D%3D%3D%3D't'%3F'tv_seasons'%3Acode%5B0%5D%3D%3D%3D'b'%3F'books'%3Acode%5B0%5D%3D%3D%3D'w'%3F'webtoons'%3A''%3Bconst%20p%3Drows.get(code)%7C%7C%7Bcode%3Acode%2Ctype%3Akind%2Ctitle%3A''%2Cyear%3A''%2Crating%3Anull%7D%3Bif(title%26%26!p.title)p.title%3Dtitle%3Bif(yr%26%26!p.year)p.year%3Dyr%5B1%5D%3Bif(star%26%26p.rating%3D%3Dnull)%7Bconst%20v%3D%2Bstar%5B1%5D%3Bif(v%3E0%26%26v%3C%3D5)p.rating%3Dv%3B%7Drows.set(code%2Cp)%3B%7Dtip.remove()%3Bconst%20items%3D%5B...rows.values()%5D.filter(x%3D%3Ex.rating!%3Dnull)%3Bif(!items.length)%7Balert('%EB%B3%84%EC%A0%90%EC%9D%84%20%EB%AA%BB%20%EC%B0%BE%EC%95%98%EC%8A%B5%EB%8B%88%EB%8B%A4.%5Cn%5Cn%E2%91%A0%20%EB%A1%9C%EA%B7%B8%EC%9D%B8%20%EC%83%81%ED%83%9C%EC%9D%B8%EC%A7%80%5Cn%E2%91%A1%20%22%EB%B3%84%EC%A0%90%22%20%EB%AA%A9%EB%A1%9D%20%ED%8E%98%EC%9D%B4%EC%A7%80%EC%9D%B8%EC%A7%80%20%ED%99%95%EC%9D%B8%ED%95%98%EC%84%B8%EC%9A%94.%5Cn%EC%A3%BC%EC%86%8C%3A%20%2Fcontents%2Fmovies%2Fratings%20(%EB%92%A4%EC%97%90%20%3Ftype%3DbyStar%20%EB%8A%94%20%EB%B9%BC%EC%84%B8%EC%9A%94)')%3Breturn%3B%7Dconst%20json%3DJSON.stringify(items%2Cnull%2C2)%3Bconst%20box%3Ddocument.createElement('div')%3Bbox.id%3D'wxbox'%3Bbox.style.cssText%3D'position%3Afixed%3Bz-index%3A2147483647%3Binset%3A5%25%2010%25%3Bbackground%3A%2316161a%3Bcolor%3A%23ededf0%3Bborder%3A1px%20solid%20%23333%3Bborder-radius%3A12px%3Bpadding%3A16px%3Bdisplay%3Aflex%3Bflex-direction%3Acolumn%3Bgap%3A10px%3Bfont%3A14px%20system-ui%3Bbox-shadow%3A0%2010px%2050px%20rgba(0%2C0%2C0%2C.6)'%3Bconst%20head%3Ddocument.createElement('div')%3Bhead.innerHTML%3D'%3Cb%3E'%2Bitems.length%2B'%EA%B0%9C%20%EC%B6%94%EC%B6%9C%20%EC%99%84%EB%A3%8C%3C%2Fb%3E%20%26nbsp%3B%3Cspan%20style%3D%22opacity%3A.7%22%3E%EB%B3%B5%EC%82%AC%20%ED%9B%84%20%EA%B4%80%EB%A6%AC%EC%9E%90%20%26gt%3B%20%EC%98%81%ED%99%94%20%EA%B4%80%EB%A6%AC%20%26gt%3B%20%EC%99%93%EC%B1%A0%ED%94%BC%EB%94%94%EC%95%84%20%EA%B0%80%EC%A0%B8%EC%98%A4%EA%B8%B0%EC%97%90%20%EB%B6%99%EC%97%AC%EB%84%A3%EA%B8%B0%3C%2Fspan%3E'%3Bconst%20ta%3Ddocument.createElement('textarea')%3Bta.value%3Djson%3Bta.style.cssText%3D'flex%3A1%3Bwidth%3A100%25%3Bbackground%3A%230d0d0f%3Bcolor%3A%23ededf0%3Bborder%3A1px%20solid%20%23333%3Bborder-radius%3A8px%3Bpadding%3A10px%3Bfont%3A12px%20ui-monospace%2Cmonospace%3Bresize%3Anone'%3Bconst%20bar%3Ddocument.createElement('div')%3Bbar.style.cssText%3D'display%3Aflex%3Bgap%3A8px'%3Bconst%20mk%3D(t%2Cf)%3D%3E%7Bconst%20b%3Ddocument.createElement('button')%3Bb.textContent%3Dt%3Bb.style.cssText%3D'flex%3A1%3Bpadding%3A14px%3Bborder-radius%3A8px%3Bborder%3A1px%20solid%20%23444%3Bbackground%3A%23222%3Bcolor%3A%23ededf0%3Bcursor%3Apointer%3Bfont%3A15px%20system-ui'%3Bb.onclick%3Df%3Breturn%20b%3B%7D%3Bconst%20done%3D()%3D%3E%7Bhead.querySelector('b').textContent%3D'%EB%B3%B5%EC%82%AC%EB%90%A8!%20%EA%B4%80%EB%A6%AC%EC%9E%90%EC%97%90%20%EB%B6%99%EC%97%AC%EB%84%A3%EC%9C%BC%EC%84%B8%EC%9A%94'%3B%7D%3Bbar.appendChild(mk('%EB%B3%B5%EC%82%AC'%2Casync()%3D%3E%7Btry%7Bawait%20navigator.clipboard.writeText(json)%3Bdone()%3B%7Dcatch%7Bta.focus()%3Bta.select()%3Bta.setSelectionRange(0%2Cjson.length)%3Btry%7Bdocument.execCommand('copy')%3Bdone()%3B%7Dcatch%7Bhead.querySelector('b').textContent%3D'%EA%B8%B8%EA%B2%8C%20%EB%88%8C%EB%9F%AC%20%EC%A0%84%EC%B2%B4%20%EC%84%A0%ED%83%9D%20%ED%9B%84%20%EB%B3%B5%EC%82%AC%ED%95%98%EC%84%B8%EC%9A%94'%3B%7D%7D%7D))%3Bbar.appendChild(mk('%ED%8C%8C%EC%9D%BC%EB%A1%9C%20%EC%A0%80%EC%9E%A5'%2C()%3D%3E%7Bconst%20el%3Ddocument.createElement('a')%3Bel.href%3DURL.createObjectURL(new%20Blob(%5Bjson%5D%2C%7Btype%3A'application%2Fjson'%7D))%3Bel.download%3D'watcha-'%2Bitems.length%2B'.json'%3Bdocument.body.appendChild(el)%3Bel.click()%3BsetTimeout(()%3D%3E%7BURL.revokeObjectURL(el.href)%3Bel.remove()%3B%7D%2C2000)%3B%7D))%3Bbar.appendChild(mk('%EB%8B%AB%EA%B8%B0'%2C()%3D%3Ebox.remove()))%3Bbox.appendChild(head)%3Bbox.appendChild(ta)%3Bbox.appendChild(bar)%3Bdocument.body.appendChild(box)%3Bta.focus()%3Bta.select()%3B%7D)()%3B
```
