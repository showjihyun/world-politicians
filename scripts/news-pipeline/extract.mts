import fs from 'node:fs';
import { CONFIG } from './config.mts';
import { applyResult, pickForRetry } from './core.mts';
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

/**
 * 이미 쌓인 미분류 신호를 다시 분류한다.
 *
 * 파이프라인은 새로 수집한 기사만 분류하므로, 한 번 실패한 신호는 다시 보지
 * 않는다. 실제로 2026-08-12~17 엿새치 29건이 그렇게 갇혀 있었다 — 기사가
 * 어려워서가 아니라 그 기간 분류가 실패한 것이고, 화면에는 극성도 요약도 없이
 * 나갔다.
 *
 * 실패해도 원본을 지운다거나 빈 값으로 덮지 않는다. 다음 실행이 또 시도한다.
 */
export async function reclassify(signals: Signal[], limit = CONFIG.llm.retryLimit): Promise<Signal[]> {
  const targets = pickForRetry(signals, limit);
  if (!targets.length) return signals;

  const llm = makeLLM();
  if (!llm) {
    console.warn(`[reclassify] NEWS_LLM_API_KEY 없음 → 미분류 ${targets.length}건을 그대로 둔다`);
    return signals;
  }

  console.log(`[reclassify] 갇힌 미분류 ${targets.length}건 재시도 (전체 미분류 ${signals.filter((s) => !s.classified).length})`);

  const byId = new Map<string, Signal>();
  for (let i = 0; i < targets.length; i += CONFIG.llm.batchSize) {
    const batch = targets.slice(i, i + CONFIG.llm.batchSize);
    const results = await llm.classifyBatch(
      batch.map((s, idx) => ({
        idx,
        title: s.title,
        source: s.source,
        date: s.date,
        people: s.people,
      }))
    );
    for (let k = 0; k < batch.length; k++) {
      const updated = applyResult(batch[k], results.find((r) => r.idx === k));
      if (updated !== batch[k]) byId.set(batch[k].id, updated);
    }
  }

  console.log(`[reclassify] 새로 분류됨 ${byId.size}/${targets.length}`);
  return signals.map((s) => byId.get(s.id) ?? s);
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
    fs.writeFileSync(CONFIG.paths.signalsCache, JSON.stringify(sigs));
    console.log(`[extract] signals=${sigs.length} -> ${CONFIG.paths.signalsCache}`);
  });
}
