import fs from 'node:fs';
import { CONFIG } from './config.mts';
import { makeLLM, type ClassifyResult } from './llm.mts';
import type { Article } from './fetch.mts';

export interface Signal {
  id: string;
  date: string;
  source: string;
  url: string;
  title: string;
  people: string[];
  pair?: [string, string];
  polarity?: 'ally' | 'feud' | 'neutral';
  confidence?: number;
  summary_en?: string;
  summary_ko?: string;
  classified: boolean;
}

export async function extractSignals(articles: Article[]): Promise<Signal[]> {
  const llm = makeLLM();
  if (!llm) {
    console.warn('[extract] NEWS_LLM_API_KEY 없음 → co-mention 신호만 생성 (미분류)');
  }

  // pair 후보: 기사에 데이터셋 인물 2명 이상
  const pairArticles = articles.filter((a) => a.people.length >= 2);
  console.log(`[extract] pair-candidate articles: ${pairArticles.length}`);

  const signals: Signal[] = [];
  const batches: Article[][] = [];
  for (let i = 0; i < pairArticles.length; i += CONFIG.llm.batchSize) {
    batches.push(pairArticles.slice(i, i + CONFIG.llm.batchSize));
  }
  console.log(`[extract] batches: ${batches.length}${llm ? '' : ' (skipping llm)'}`);

  let batchNo = 0;
  for (const batch of batches) {
    let results: ClassifyResult[] = [];
    if (llm) {
      results = await llm.classifyBatch(
        batch.map((a, i) => ({
          idx: i,
          title: a.title,
          source: a.source,
          date: a.date,
          people: a.people,
        }))
      );
      process.stdout.write(`[extract] batch ${++batchNo}/${batches.length} → ${results.length} classified\r\n`);
    }

    for (let i = 0; i < batch.length; i++) {
      const a = batch[i];
      const r = results.find((x) => x.idx === i);
      const pair = r?.pair && a.people.includes(r.pair[0]) && a.people.includes(r.pair[1])
        ? ([...r.pair].sort() as [string, string])
        : ([a.people[0], a.people[1]].sort() as [string, string]);
      signals.push({
        id: `sig-${hash(a.url + a.title).slice(0, 12)}`,
        date: a.date,
        source: a.source,
        url: a.url,
        title: a.title,
        people: a.people,
        pair,
        polarity: r?.polarity,
        confidence: r?.confidence,
        summary_en: r?.summary_en,
        summary_ko: r?.summary_ko,
        classified: Boolean(r),
      });
    }
  }

  return signals;
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

if (process.argv[1]?.endsWith('extract.mts')) {
  const arts: Article[] = JSON.parse(fs.readFileSync(CONFIG.paths.rawCache, 'utf8'));
  extractSignals(arts).then((sigs) => {
    fs.writeFileSync(CONFIG.paths.rawCache.replace('.raw-cache', '.signals'), JSON.stringify(sigs));
    console.log(`[extract] signals=${sigs.length}`);
  });
}
