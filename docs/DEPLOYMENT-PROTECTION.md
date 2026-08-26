# Vercel Deployment Protection 검토

검토일: 2026-08-27. 이 문서는 기능 가능 여부만 기록하며 프로젝트 설정은 변경하지 않았다.

## 결론

- Hobby에서도 **Vercel Authentication + Standard Protection은 가능**하다. Preview 배포 URL과 생성된 deployment URL은 Vercel 계정 인증 뒤에 둘 수 있다.
- Hobby의 Standard Protection은 **현재 production custom domain을 보호하지 않는다**. production domain까지 모두 보호하는 All Deployments 범위는 Pro/Enterprise가 필요하다.
- 따라서 robots.txt보다 앞에서 Preview 함수 도달을 막는 용도로는 쓸 수 있지만, Lyra production 관리자 인증을 대체할 수는 없다. `/admin` 쿠키 인증과 API 인증 경계를 그대로 유지해야 한다.
- Standard Protection을 켜면 생성된 production URL도 제한될 수 있으므로, `VERCEL_URL`을 향하는 내부 fetch 대신 현재처럼 상대 경로/요청 origin을 써야 한다.

근거는 Vercel 공식 [Deployment Protection 문서](https://vercel.com/docs/deployment-protection)와 [Hobby 플랜 문서](https://vercel.com/docs/plans/hobby)다. 두 문서 모두 Vercel Authentication을 모든 플랜에서 제공하고 Standard Protection이 production domain을 제외한다고 명시한다.

## 권고

소유자가 Vercel Dashboard의 Project → Settings → Deployment Protection에서 현재 설정을 확인한 뒤, Preview 비공개가 필요하면 Standard Protection을 선택한다. 이번 작업에서는 계정·프로젝트 설정 조회나 변경 API를 호출하지 않았고 `vercel.json`, 환경변수, 도메인 설정도 건드리지 않았다.
