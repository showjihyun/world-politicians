import fs from 'node:fs';
import { CONFIG } from './config.mts';
import type { Signal } from './extract.mts';

export interface SignalsFile {
  generatedAt: string;
  windowDays: number;
  stats: {
    total: number;
    classified: number;
    ally: number;
    feud: number;
    neutral: number;
  };
  signals: Signal[];
}

export function buildFile(signals: Signal[]): SignalsFile {
  const sorted = [...signals]
    .sort((a, b) => {
      const rank = (s: Signal) => (s.classified && s.polarity !== 'neutral' ? 0 : 1);
      return rank(a) - rank(b) || (a.date < b.date ? 1 : -1);
    })
    .slice(0, CONFIG.maxSignals);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: CONFIG.windowDays,
    stats: {
      total: sorted.length,
      classified: sorted.filter((s) => s.classified).length,
      ally: sorted.filter((s) => s.polarity === 'ally').length,
      feud: sorted.filter((s) => s.polarity === 'feud').length,
      neutral: sorted.filter((s) => !s.classified || s.polarity === 'neutral').length,
    },
    signals: sorted,
  };
}

export function writeOutput(file: SignalsFile, dry: boolean): string {
  const json = JSON.stringify(file, null, dry ? 0 : 2);
  if (dry) {
    const p = 'scripts/news-pipeline/.dry-output.json';
    fs.writeFileSync(p, json);
    console.log(`[merge] DRY → ${p} (${file.stats.total} signals)`);
    return p;
  }
  fs.mkdirSync('src/data', { recursive: true });
  fs.writeFileSync(CONFIG.paths.outJson, json + '\n');
  console.log(`[merge] wrote ${CONFIG.paths.outJson}`);
  return CONFIG.paths.outJson;
}
