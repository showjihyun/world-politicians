import fs from 'node:fs';
import { CONFIG, PERSON_ALIASES, SOURCE_HOSTS, SOURCE_NAME_ALIASES } from './config.mts';
import { isAllowedSource as isAllowed, resolveSourceName } from './core.mts';

export interface Person {
  id: string;
  enName: string;
  tokens: string[];
}

export interface Article {
  url: string;
  title: string;
  source: string;
  date: string;
  people: string[];
}

export function loadPeople(): Person[] {
  const people: Person[] = [];
  const seen = new Set<string>();
  for (const file of fs.readdirSync(CONFIG.paths.politiciansDir)) {
    if (!file.endsWith('.ts')) continue;
    const text = fs.readFileSync(`${CONFIG.paths.politiciansDir}/${file}`, 'utf8');
    const re = /id:\s*'([a-z0-9-]+)'[\s\S]{0,400}?enName:\s*'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      people.push({ id: m[1], enName: m[2], tokens: PERSON_ALIASES[m[1]] ?? [m[2].toLowerCase()] });
    }
  }
  return people;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parseRssItems(xml: string): { title: string; link: string; pubDate: string; sourceUrl: string; sourceName: string }[] {
  const items: { title: string; link: string; pubDate: string; sourceUrl: string; sourceName: string }[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const b of blocks) {
    const title = decodeEntities(b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    const linkRaw = b.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? '';
    const pubDate = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    const srcTag = b.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
    items.push({
      title,
      link: decodeEntities(linkRaw),
      pubDate,
      sourceUrl: srcTag?.[1] ?? '',
      sourceName: srcTag ? decodeEntities(srcTag[2]) : '',
    });
  }
  return items;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'PolarisNewsBot/1.0 (+relationship atlas research)' },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** 허용 매체 판정 — 규칙은 core.mts, 여기서는 이 앱의 목록을 묶어준다 */
export function isAllowedSource(sourceUrl: string, sourceName: string): boolean {
  return isAllowed(sourceUrl, sourceName, CONFIG.allowedSourceHosts, CONFIG.allowedSourceNames);
}

function normalizeToken(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function matchPeople(title: string, people: Person[]): string[] {
  const hay = normalizeToken(title);
  const matched: string[] = [];
  for (const p of people) {
    if (p.tokens.some((tk) => hay.includes(normalizeToken(tk)))) matched.push(p.id);
  }
  return matched;
}

function dedupeKey(a: { title: string }): string {
  return a.title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 80);
}

export async function fetchAllArticles(): Promise<Article[]> {
  const people = loadPeople();
  console.log(`[fetch] dataset people: ${people.length}`);
  const byKey = new Map<string, Article>();
  const cutoff = Date.now() - CONFIG.windowDays * 86_400_000;

  const addArticle = (
    title: string,
    link: string,
    pubDate: string,
    sourceName: string,
    sourceUrl: string
  ): void => {
    if (!title || title.length < 20) return;
    const ts = pubDate ? new Date(pubDate).getTime() : NaN;
    if (!Number.isNaN(ts) && ts < cutoff) return;
    // **정본 이름으로 먼저 바꾼다.** 그다음에 판정하고, 그 이름을 저장한다.
    // 호스트 형태로 온 이름을 그대로 저장하면 수집은 통과하고 감사는 떨어뜨린다 —
    // 같은 함수가 입력이 달라 반대 답을 내고, 그날 수집분이 커밋 직전에 버려진다.
    const resolved = resolveSourceName(
      sourceName,
      sourceUrl || link,
      CONFIG.allowedSourceNames,
      SOURCE_HOSTS,
      SOURCE_NAME_ALIASES
    );
    if (link.includes('news.google.com') && !isAllowedSource(sourceUrl, resolved)) return;
    const key = dedupeKey({ title });
    if (byKey.has(key)) return;
    byKey.set(key, {
      url: link || sourceUrl,
      title,
      source: resolved || new URL(link.startsWith('http') ? link : 'https://x.invalid').hostname,
      date: Number.isNaN(ts) ? new Date().toISOString().slice(0, 10) : new Date(ts).toISOString().slice(0, 10),
      people: [],
    });
  };

  // 1) Google News RSS per politician
  let done = 0;
  for (const p of people) {
    const q = encodeURIComponent(p.tokens.map((t) => `"${t}"`).join(' OR ') + ` when:${CONFIG.windowDays}d`);
    const xml = await fetchText(`${CONFIG.googleNewsRss}?q=${q}&hl=en-US&gl=US&ceid=US:en`);
    if (xml) {
      for (const it of parseRssItems(xml)) addArticle(it.title, it.link, it.pubDate, it.sourceName, it.sourceUrl);
    }
    done++;
    if (done % 25 === 0) console.log(`[fetch] google-news ${done}/${people.length}, unique=${byKey.size}`);
    await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
  }

  // 2) Outlet feeds 직접 수집
  for (const feed of CONFIG.outletFeeds) {
    const xml = await fetchText(feed.url);
    if (!xml) continue;
    for (const it of parseRssItems(xml)) addArticle(it.title, it.link, it.pubDate, feed.name, feed.url);
    console.log(`[fetch] outlet ${feed.name}: ok`);
  }

  const articles = [...byKey.values()];
  for (const a of articles) a.people = matchPeople(a.title, people);
  const relevant = articles.filter((a) => a.people.length > 0);
  console.log(`[fetch] total unique=${articles.length}, with-dataset-person=${relevant.length}`);
  return relevant.sort((a, b) => (a.date < b.date ? 1 : -1));
}

if (process.argv[1]?.endsWith('fetch.mts')) {
  fetchAllArticles().then((arts) => {
    fs.writeFileSync(CONFIG.paths.rawCache, JSON.stringify(arts, null, 0));
    console.log(`[fetch] cached -> ${CONFIG.paths.rawCache}`);
  });
}
