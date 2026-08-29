/**
 * 방문자 카운터.
 *
 * 이 저장소의 유일한 서버 코드다. 방문자 수를 화면에 띄우려면 어딘가에 숫자를
 * 두어야 하는데, 제3자 분석 서비스에 방문자 정보를 넘기지 않기 위해 자체
 * 엔드포인트로 처리한다. 저장은 Vercel KV(Upstash Redis) REST API 를 직접
 * 호출한다 — SDK 를 의존성으로 추가할 만큼 하는 일이 많지 않다.
 *
 *   GET /api/hits          현재 카운트만 조회
 *   GET /api/hits?bump=1   1 증가시킨 뒤 조회 (클라이언트가 세션당 한 번만 호출)
 *
 * KV 환경변수가 없으면(로컬 개발, 스토어 미연결) 500 대신 count:null 을 준다.
 * 카운터 하나 때문에 화면이 깨지면 안 된다 — 프런트는 null 이면 그냥 숨긴다.
 */
export const config = { runtime: 'edge' };

const KEY = 'polaris:visits';

function json(body: unknown, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) return json({ count: null, reason: 'kv-not-configured' });

  const bump = new URL(req.url).searchParams.get('bump') === '1';
  const command = bump ? `incr/${KEY}` : `get/${KEY}`;

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/${command}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return json({ count: null, reason: `kv-${res.status}` });

    // Upstash REST 는 { result: <값> } 형태로 돌려준다. get 은 미설정 시 null.
    const data = (await res.json()) as { result?: unknown };
    const n = Number(data.result ?? 0);
    return json({ count: Number.isFinite(n) ? n : 0 });
  } catch {
    return json({ count: null, reason: 'kv-unreachable' });
  }
}
