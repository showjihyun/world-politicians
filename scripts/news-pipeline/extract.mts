import fs from 'node:fs';
import { CONFIG } from './config.mts';
import { applyResult, pickForRetry } from './core.mts';
import { makeLLM, type ClassifyResult } from './llm.mts';
import type { Article } from './fetch.mts';

export interface Signal {
  id: string;
  date: string;
  /** 기사에 적힌 매체명 그대로. 화면의 와이어 목록이 이 값을 보여준다 */
  source: string;
  /**
   * 집계용 정본 매체명. `source` 와 같으면 넣지 않는다.
   * 시계열이 "하루 한 표" 를 매체 단위로 셀 때 이 값을 쓴다 — 원본으로 세면
   * `Politico` 와 `POLITICO Pro` 가 서로 다른 매체로 잡혀 한 뉴스룸이 두 표를 던진다.
   */
  outlet?: string;
  url: string;
  title: string;
  people: string[];
  pair?: [string, string];
  /** 모델이 이 쌍을 고른 근거 구절 — 오배정을 눈으로 확인할 수 있게 남긴다 */
  evidence?: string;
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
  let unpaired = 0;
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
        // applyResult 와 같은 규칙이어야 한다 — 같은 사람을 두 번 짚으면
        // pairKey 가 'trump|trump' 가 되어 자기 자신과의 엣지가 생긴다.
        //
        // 모델이 쌍을 특정하지 못하면 그대로 비워 둔다. 예전에는 첫 두 사람을
        // 임의로 붙였는데 그게 오배정의 통로였다 — 'Raskin targets Kushner' 기사가
        // Jeffries×Trump 로 붙는 식이다. 라벨 20건 중 2건(10%)이 그랬다.
        // 쌍이 없어도 신호는 남는다. 두 사람의 Latest Wire 에는 그대로 나오고
        // 관계에 귀속되지 않을 뿐이다.
        const ok = Boolean(
          r?.pair &&
            r.pair[0] !== r.pair[1] &&
            a.people.includes(r.pair[0]) &&
            a.people.includes(r.pair[1])
        );
        const pair = ok ? ([...r!.pair!].sort() as [string, string]) : undefined;
        if (r && !ok) unpaired++;
      signals.push({
        id: `sig-${hash(a.url + a.title).slice(0, 12)}`,
        date: a.date,
        source: a.source,
        url: a.url,
        title: a.title,
        people: a.people,
        pair,
        evidence: r?.evidence,
        polarity: r?.polarity,
        confidence: r?.confidence,
        summary_en: r?.summary_en,
        summary_ko: r?.summary_ko,
        classified: Boolean(r),
      });
    }
  }

  if (unpaired) {
    console.log(`[extract] 관계쌍을 특정하지 못한 기사 ${unpaired}건 — 신호는 남기고 쌍은 비운다`);
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
