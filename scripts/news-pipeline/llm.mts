import OpenAI from 'openai';
import { CONFIG } from './config.mts';

export interface ClassifyInput {
  idx: number;
  title: string;
  source: string;
  date: string;
  people: string[];
}

export interface ClassifyResult {
  idx: number;
  pair: [string, string] | null;
  polarity: 'ally' | 'feud' | 'neutral';
  confidence: number;
  summary_en?: string;
  summary_ko?: string;
}

function extractJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const SYSTEM_PROMPT = `You are a political relationship classifier for a US politics network graph.
Given news articles, detect interactions between the listed politician IDs.

Return ONLY a JSON array, one entry per article:
[{"idx":0,"pair":["idA","idB"]|null,"polarity":"ally"|"feud"|"neutral","confidence":0.0-1.0,"summary_en":"...","summary_ko":"..."}]

Rules:
- pair = the two most salient interacting people from that article's "people" list (exactly their IDs).
- polarity "ally": cooperation, endorsement, praise, joint legislation, defense of each other.
- polarity "feud": criticism, attacks, feuds, lawsuits, public breaks, mockery.
- polarity "neutral": mere co-mention without clear interaction (then pair may still be filled or null).
- summary_en / summary_ko: one sentence each (<=140 chars), Korean must be natural news Korean.
- Never invent IDs not present in that article's list.`;

export function makeLLM() {
  if (!CONFIG.llm.apiKey) return null;
  const client = new OpenAI({
    apiKey: CONFIG.llm.apiKey,
    baseURL: CONFIG.llm.baseURL,
  });

  async function classifyBatch(batch: ClassifyInput[]): Promise<ClassifyResult[]> {
    const listing = batch
      .map(
        (a) =>
          `[${a.idx}] (${a.date} · ${a.source}) people=[${a.people.join(', ')}]\n"${a.title.replace(/"/g, "'")}"`
      )
      .join('\n');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await client.chat.completions.create({
          model: CONFIG.llm.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: listing },
          ],
          temperature: CONFIG.llm.temperature,
          max_tokens: CONFIG.llm.maxTokens,
          stream: false,
          chat_template_kwargs: { enable_thinking: false },
        } as never);
        const content =
          (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]
            ?.message?.content ?? '';
        const arr = extractJsonArray(content);
        const results: ClassifyResult[] = [];
        for (const raw of arr) {
          const r = raw as Partial<ClassifyResult>;
          if (
            typeof r.idx !== 'number' ||
            !Array.isArray(r.pair) ||
            r.pair.length !== 2 ||
            typeof r.polarity !== 'string'
          ) {
            continue;
          }
          const pol = ['ally', 'feud', 'neutral'].includes(r.polarity)
            ? (r.polarity as ClassifyResult['polarity'])
            : 'neutral';
          results.push({
            idx: r.idx,
            pair: [String(r.pair[0]), String(r.pair[1])],
            polarity: pol,
            confidence: typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.5,
            summary_en: typeof r.summary_en === 'string' ? r.summary_en.slice(0, 200) : undefined,
            summary_ko: typeof r.summary_ko === 'string' ? r.summary_ko.slice(0, 200) : undefined,
          });
        }
        if (results.length > 0 || attempt === 1) return results;
      } catch (err) {
        console.warn(`  [llm] batch attempt ${attempt + 1} failed:`, (err as Error).message?.slice(0, 120));
      }
    }
    return [];
  }

  return { classifyBatch };
}
