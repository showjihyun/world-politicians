import fs from 'node:fs';
import path from 'node:path';

/** 로컬 .env 수동 로드 (CI에서는 실제 env 사용) */
function loadDotEnv(): void {
  const p = path.resolve(import.meta.dirname, '../../.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadDotEnv();

/**
 * 허용 호스트 → 정본 매체명.
 *
 * **Google News 가 매체명을 호스트 형태로 줄 때가 있다.** 같은 응답 안에 `PBS` 와
 * `aljazeera.com` 이 함께 온다. 그러면 수집은 통과하는데(`<source url>` 의 호스트가
 * 맞으므로) 아카이브에는 `foxnews.com` 이 남고, 감사는 기사 link(구글 리다이렉트)와
 * 그 이름으로 다시 판정해 **허용 목록 밖**이라고 떨어뜨린다. 2026-09-01~03 사흘치
 * 야간 수집이 이것 때문에 커밋 직전에 통째로 버려졌다.
 *
 * 호스트와 이름을 한 표에 둔다 — 따로 두면 둘이 조용히 어긋난다.
 */
export const SOURCE_HOSTS: Record<string, string> = {
  'apnews.com': 'AP News',
  'reuters.com': 'Reuters',
  'cnn.com': 'CNN',
  'foxnews.com': 'Fox News',
  'nbcnews.com': 'NBC News',
  'abcnews.go.com': 'ABC News',
  'cbsnews.com': 'CBS News',
  'npr.org': 'NPR',
  'politico.com': 'Politico',
  'thehill.com': 'The Hill',
  'axios.com': 'Axios',
  'rollcall.com': 'Roll Call',
  'washingtonexaminer.com': 'Washington Examiner',
  'semafor.com': 'Semafor',
  'nytimes.com': 'The New York Times',
  'washingtonpost.com': 'The Washington Post',
  'wsj.com': 'The Wall Street Journal',
};

export const CONFIG = {
  windowDays: 30,
  maxSignals: 300,
  maxArchive: 1500,
  requestDelayMs: 120,

  /** Top US outlets — 기사 출처 화이트리스트 */
  /** SOURCE_HOSTS 에서 파생한다 — 호스트 목록을 두 곳에 두면 조용히 어긋난다 */
  allowedSourceHosts: Object.keys(SOURCE_HOSTS),
  allowedSourceNames: [
    'Associated Press', 'AP News', 'AP', 'Reuters', 'CNN', 'Fox News',
    'NBC News', 'ABC News', 'CBS News', 'NPR', 'Politico', 'The Hill',
    'Axios', 'Roll Call', 'Washington Examiner', 'Semafor',
    'The New York Times', 'The Washington Post', 'The Wall Street Journal', 'WSJ',
  ],

  /** 직접 수집하는 주요 방송국 RSS */
  outletFeeds: [
    { name: 'Fox News', url: 'https://feeds.foxnews.com/foxnews/politics' },
    { name: 'CNN', url: 'http://rss.cnn.com/rss/cnn_allpolitics.rss' },
    { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
    { name: 'The Hill', url: 'https://thehill.com/feed/' },
    { name: 'Politico', url: 'https://www.politico.com/rss/politicopicks.xml' },
    { name: 'Axios', url: 'https://api.axios.com/feed/rss' },
    { name: 'Roll Call', url: 'https://rollcall.com/feed/' },
  ],

  googleNewsRss: 'https://news.google.com/rss/search',

  llm: {
    apiKey: process.env.NEWS_LLM_API_KEY ?? '',
    baseURL: process.env.NEWS_LLM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    model: process.env.NEWS_LLM_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b',
    temperature: 0.2,
    maxTokens: 4096,
    batchSize: 10,
    /** 한 실행에서 다시 시도할 미분류 신호 수 — 장애가 길었으면 수백 건일 수 있다 */
    retryLimit: 60,
  },

  paths: {
    politiciansDir: path.resolve(import.meta.dirname, '../../src/data/politicians'),
    outJson: path.resolve(import.meta.dirname, '../../src/data/news-signals.json'),
    /** 월별 파티션이 사는 곳 — 아카이브가 커져도 초기 번들이 커지지 않게 한다 */
    signalsDir: path.resolve(import.meta.dirname, '../../src/data/signals'),
    rawCache: path.resolve(import.meta.dirname, '.raw-cache.json'),
    signalsCache: path.resolve(import.meta.dirname, '.signals-cache.json'),
  },
};

/** 인물 매칭용 별칭 — [id, ...검색/매칭 토큰] */
export const PERSON_ALIASES: Record<string, string[]> = {
  trump: ['donald trump', 'president trump', 'trump'],
  vance: ['jd vance', 'j.d. vance', 'vance'],
  rubio: ['marco rubio', 'rubio'],
  hegseth: ['pete hegseth', 'hegseth'],
  'rfk-jr': ['robert f. kennedy', 'rfk jr.', 'rfk jr', 'rfk'],
  gabbard: ['tulsi gabbard', 'gabbard'],
  noem: ['kristi noem', 'noem'],
  bondi: ['pam bondi', 'bondi'],
  musk: ['elon musk', 'musk'],
  bannon: ['steve bannon', 'bannon'],
  biden: ['joe biden', 'biden'],
  harris: ['kamala harris', 'harris'],
  obama: ['barack obama', 'obama'],
  pence: ['mike pence', 'pence'],
  thune: ['john thune', 'thune'],
  mcconnell: ['mitch mcconnell', 'mcconnell'],
  graham: ['lindsey graham', 'sen. graham'],
  cruz: ['ted cruz', 'cruz'],
  hawley: ['josh hawley', 'hawley'],
  cotton: ['tom cotton', 'sen. cotton'],
  'paul-rand': ['rand paul'],
  'lee-mike': ['mike lee', 'sen. lee'],
  ernst: ['joni ernst', 'ernst'],
  'collins-susan': ['susan collins', 'collins'],
  murkowski: ['lisa murkowski', 'murkowski'],
  cassidy: ['bill cassidy', 'cassidy'],
  tillis: ['thom tillis', 'tillis'],
  tuberville: ['tommy tuberville', 'tuberville'],
  britt: ['katie britt', 'britt'],
  blackburn: ['marsha blackburn', 'blackburn'],
  schmitt: ['eric schmitt', 'schmitt'],
  moreno: ['bernie moreno'],
  'rick-scott': ['rick scott', 'sen. scott'],
  'tim-scott': ['tim scott', 'sen. tim scott'],
  schumer: ['chuck schumer', 'schumer'],
  durbin: ['dick durbin', 'durbin'],
  warren: ['elizabeth warren', 'warren'],
  sanders: ['bernie sanders', 'sanders'],
  klobuchar: ['amy klobuchar', 'klobuchar'],
  booker: ['cory booker', 'booker'],
  warnock: ['raphael warnock', 'warnock'],
  fetterman: ['john fetterman', 'fetterman'],
  duckworth: ['tammy duckworth', 'duckworth'],
  schiff: ['adam schiff', 'schiff'],
  padilla: ['alex padilla', 'padilla'],
  slotkin: ['elissa slotkin', 'slotkin'],
  'kim-andy': ['andy kim', 'rep. kim'],
  markey: ['ed markey', 'markey'],
  gallego: ['ruben gallego', 'gallego'],
  'kelly-mark': ['mark kelly', 'sen. kelly'],
  'murphy-chris': ['chris murphy', 'sen. murphy'],
  ossoff: ['jon ossoff', 'ossoff'],
  'johnson-mike': ['mike johnson', 'speaker johnson'],
  scalise: ['steve scalise', 'scalise'],
  emmer: ['tom emmer', 'emmer'],
  stefanik: ['elise stefanik', 'stefanik'],
  'jordan-jim': ['jim jordan', 'rep. jordan', 'jordan'],
  mtg: ['marjorie taylor greene', 'mtg'],
  boebert: ['lauren boebert', 'boebert'],
  'mace-nancy': ['nancy mace', 'mace'],
  luna: ['anna paulina luna', 'luna'],
  massie: ['thomas massie', 'massie'],
  donalds: ['byron donalds', 'donalds'],
  'bacon-don': ['don bacon', 'bacon'],
  fitzpatrick: ['brian fitzpatrick', 'fitzpatrick'],
  'lawler-mike': ['mike lawler', 'lawler'],
  jeffries: ['hakeem jeffries', 'jeffries'],
  pelosi: ['nancy pelosi', 'pelosi'],
  aoc: ['alexandria ocasio-cortez', 'ocasio-cortez', 'aoc'],
  'omar-ilhan': ['ilhan omar', 'rep. omar'],
  tlaib: ['rashida tlaib', 'tlaib'],
  pressley: ['ayanna pressley', 'pressley'],
  crockett: ['jasmine crockett', 'crockett'],
  'frost-maxwell': ['maxwell frost', 'rep. frost'],
  khanna: ['ro khanna', 'khanna'],
  'torres-ritchie': ['ritchie torres', 'torres'],
  'golden-jared': ['jared golden', 'golden'],
  'perez-marie': ['gluesenkamp perez'],
  newsom: ['gavin newsom', 'newsom'],
  whitmer: ['gretchen whitmer', 'whitmer'],
  pritzker: ['jb pritzker', 'pritzker'],
  shapiro: ['josh shapiro', 'shapiro'],
  walz: ['tim walz', 'walz'],
  'moore-wes': ['wes moore', 'gov. moore'],
  desantis: ['ron desantis', 'desantis'],
  'abbott-greg': ['greg abbott', 'abbott'],
  hillary: ['hillary clinton', 'hillary'],
  'bill-clinton': ['bill clinton', 'president clinton'],
  'bush-w': ['george w. bush', 'george bush', 'president bush'],
  'jeb-bush': ['jeb bush', 'jeb'],
  'dick-cheney': ['dick cheney', 'cheney'],
  'liz-cheney': ['liz cheney', 'liz cheney'],
  kinzinger: ['adam kinzinger', 'kinzinger'],
  romney: ['mitt romney', 'romney'],
  'mccain-john': ['john mccain', 'mccain'],
  manchin: ['joe manchin', 'manchin'],
  sinema: ['kyrsten sinema', 'sinema'],
  'gaetz-matt': ['matt gaetz', 'gaetz'],
  'mccarthy-kevin': ['kevin mccarthy', 'mccarthy'],
  'haley-nikki': ['nikki haley', 'haley'],
  buttigieg: ['pete buttigieg', 'buttigieg'],
};
