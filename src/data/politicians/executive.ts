import type { Politician } from '../../types';
import { L, Larr } from '../L';

/**
 * Executive · Former Presidents · Special actors
 * Snapshot: Aug 2026 (47th administration, Trump II)
 */
export const EXECUTIVE: Politician[] = [
  {
    id: 'trump',
    name: L('Donald J. Trump', '도널드 트럼프'),
    enName: 'Donald J. Trump',
    party: 'R',
    branch: 'executive',
    role: L('47th President of the United States', '제47대 미국 대통령'),
    state: 'FL',
    faction: 'maga',
    prominence: 10,
    buzz: 100,
    bio: L(
      'Twice impeached, criminally convicted — and re-elected anyway. The most polarizing president in modern history; the entire GOP now runs on his name.',
      '2차례 탄핵, 형사 유죄를 넘어 재선에 성공한 역사상 가장 분열적인 대통령. 공화당 전체가 그의 인명장으로 재편되었다.'
    ),
    tags: Larr(['Hub node', '허브 노드'], ['MAGA founder', 'MAGA 창시자']),
  },
  {
    id: 'vance',
    name: L('JD Vance', 'J.D. 밴스'),
    enName: 'JD Vance',
    party: 'R',
    branch: 'executive',
    role: L('50th Vice President', '제50대 부통령'),
    state: 'OH',
    faction: 'maga',
    prominence: 9,
    buzz: 88,
    bio: L(
      '"Hillbilly Elegy" author → Silicon Valley VC → Senator → VP. The intellectual heir of MAGA, minted by Peter Thiel and Trump himself.',
      '「힐빌리의 애가」 저자 → 실리콘밸리 VC → 상원의원을 거쳐 부통령. 틸의 후원과 트럼프의 승계 구도 속 MAGA 지식인.'
    ),
    tags: Larr(['2028 frontrunner', '2028 유력'], ['Populist theorist', '포퓰리즘 이론가']),
  },
  {
    id: 'rubio',
    name: L('Marco Rubio', '마르코 루비오'),
    enName: 'Marco Rubio',
    party: 'R',
    branch: 'executive',
    role: L('Secretary of State (former FL Senator)', '국무장관 (전 플로리다 상원의원)'),
    state: 'FL',
    faction: 'gop-est',
    prominence: 8,
    buzz: 74,
    bio: L(
      'The man Trump mocked for "small hands" in 2016 became his Secretary of State eight years later — the ultimate story of political survival.',
      '2016년 예선에서 "작은 손" 모욕을 당했던 원래 원내파가, 8년 뒤 국무장관으로 화해의 정점을 보여줬다.'
    ),
    tags: Larr(['2028 possibility', '2028 도전 가능']),
  },
  {
    id: 'hegseth',
    name: L('Pete Hegseth', '피트 헤그세스'),
    enName: 'Pete Hegseth',
    party: 'R',
    branch: 'executive',
    role: L('Secretary of Defense (ex-Fox host)', '국방장관 (전 FOX 진행자)'),
    faction: 'maga',
    prominence: 6,
    buzz: 70,
    bio: L(
      'Fox anchor turned Defense Secretary. Survived the Signal chat leak scandal on pure loyalty.',
      'FOX 앵커 출신 국방장관. 시그널 채팅 유출 스캔들로도 물러서지 않은 충성심이 생명선.'
    ),
    tags: Larr(['Signal-gate', '시그널 게이트']),
  },
  {
    id: 'rfk-jr',
    name: L('Robert F. Kennedy Jr.', '로버트 F. 케네디 주니어'),
    enName: 'Robert F. Kennedy Jr.',
    party: 'R',
    branch: 'executive',
    role: L('Secretary of HHS', '보건복지부 장관'),
    faction: 'maga',
    prominence: 8,
    buzz: 84,
    bio: L(
      'A Kennedy dynasty name attached to vaccine skepticism. Democrat primary → independent → Trump coalition: a triple identity jump.',
      '민주당 왕조의 이름을 가진 백신 회의론자. 민주당 예선 도전 → 무소속 → 트럼프 연합이라는 정체성의 삼중 점프.'
    ),
    tags: Larr(['Kennedy dynasty', '케네디 왕조'], ['MAHA', 'MAHA']),
  },
  {
    id: 'gabbard',
    name: L('Tulsi Gabbard', '털시 개버드'),
    enName: 'Tulsi Gabbard',
    party: 'R',
    branch: 'executive',
    role: L('Director of National Intelligence (ex-Dem Rep)', '국가정보국장 (전 민주당 하원의원)'),
    state: 'HI',
    faction: 'maga',
    prominence: 6,
    buzz: 58,
    bio: L(
      'Once called a "Russian asset" by Hillary Clinton, the anti-war Democrat is now the intelligence chief of a Republican administration.',
      '힐러리 클린턴에게 "러시아 자산"이라 불렸던 반(反)전쟁 민주당원이 공화당 행정부의 정보 수장이 되었다.'
    ),
    tags: Larr(['Party switcher', '당적 변경']),
  },
  {
    id: 'noem',
    name: L('Kristi Noem', '크리스티 노엄'),
    enName: 'Kristi Noem',
    party: 'R',
    branch: 'executive',
    role: L('Secretary of Homeland Security (former SD Governor)', '국토안보부 장관 (전 사우스다코타 주지사)'),
    state: 'SD',
    faction: 'maga',
    prominence: 6,
    buzz: 60,
    bio: L(
      'The face of hardline border policy — LA deployment fights and the Padilla removal incident keep her in headlines.',
      '국경 강경책의 얼굴. LA 시위 연방군 파견과 상원의원 체포 사건으로 자주 헤드라인이 되었다.'
    ),
    tags: Larr(['Border & immigration', '국경·이민']),
  },
  {
    id: 'bondi',
    name: L('Pam Bondi', '팜 본디'),
    enName: 'Pam Bondi',
    party: 'R',
    branch: 'executive',
    role: L('Attorney General', '법무장관'),
    state: 'FL',
    faction: 'maga',
    prominence: 5,
    buzz: 55,
    bio: L(
      'Picked up the AG nomination after Gaetz collapsed — now at the center of the Epstein files controversy.',
      '개츠의 낙마 후 AG 지명을 이어받은 플로리다 검찰 출신. 에핀스타 파일 공개 논란의 한복판에 서 있다.'
    ),
    tags: Larr(['Epstein files', '에핀스타 파일']),
  },
  {
    id: 'musk',
    name: L('Elon Musk', '일론 머스크'),
    enName: 'Elon Musk',
    party: 'X',
    branch: 'special',
    role: L('Former DOGE chief · Tesla/SpaceX CEO', '前 DOGE 청장 · 테슬라/스페이스X CEO'),
    faction: 'special',
    prominence: 9,
    buzz: 96,
    status: 'active',
    bio: L(
      'Stormed Washington via DOGE, detonated the alliance after 130 days, floated an "America Party" — then rekindled it over a Mar-a-Lago dinner and returned for the midterms with $100M+. Unelected power, complete with a comeback arc.',
      'DOGE로 워싱턴에 상륙해 130일 만에 동맹을 폭발시키고 "America Party"까지 선언했지만, 마라라고 만찬으로 화해한 뒤 9자리 수 중간선거 자금과 함께 복귀. 재기 아크를 가진 비선출 권력.'
    ),
    tags: Larr(['Unelected power', '비선출 권력'], ['$100M midterm return', '중간선거 복귀']),
  },
  {
    id: 'bannon',
    name: L('Steve Bannon', '스티브 배넌'),
    enName: 'Steve Bannon',
    party: 'X',
    branch: 'special',
    role: L('War Room host · former chief strategist', 'War Room 진행자 · 前 백악관 수석 전략관'),
    faction: 'maga',
    prominence: 6,
    buzz: 62,
    bio: L(
      'The agitator of the MAGA movement. His feuds with tech-bro Republicans over H-1B and Epstein made him the voice of "movement vs billionaires" politics.',
      'MAGA 운동의 선동가. 실리콘밸리 테크 우파와의 H-1B·에핀스타 논쟁으로 "국민운동 vs 빅테크" 균열의 대변인이 되었다.'
    ),
    tags: Larr(['MAGA media', 'MAGA 미디어']),
  },
  {
    id: 'biden',
    name: L('Joe Biden', '조 바이든'),
    enName: 'Joe Biden',
    party: 'D',
    branch: 'former',
    role: L('46th President', '제46대 미국 대통령'),
    state: 'DE',
    faction: 'dem-est',
    prominence: 9,
    buzz: 72,
    status: 'departed',
    bio: L(
      '36 years in the Senate, 8 as VP — the ultimate institutionalist. His abrupt July 2024 withdrawal split the verdict on his legacy forever.',
      '36년 상원의원, 8년 부통령을 거친 제도주의자. 2024년 7월 급작스런 사퇴는 그의 유산 평가를 영원히 갈라놓았다.'
    ),
    tags: Larr(['Former president', '전직 대통령']),
  },
  {
    id: 'harris',
    name: L('Kamala Harris', '카멀라 해리스'),
    enName: 'Kamala Harris',
    party: 'D',
    branch: 'former',
    role: L('49th Vice President · 2024 nominee', '제49대 부통령 · 2024 민주당 후보'),
    state: 'CA',
    faction: 'dem-est',
    prominence: 9,
    buzz: 78,
    status: 'departed',
    bio: L(
      'The 107-day miracle replacement who lost. Her memoir "107 Days" blew open the Biden-feud and put her back in the 2028 conversation.',
      '107일의 기적 같은 교체 후보였으나 패배. 회고록 「107일」로 바이든 진영과의 불화를 공개하며 2028 구도에 다시 합류했다.'
    ),
    tags: Larr(['2028 contender', '2028 유력'], ['Memoir fallout', '회고록 파장']),
  },
  {
    id: 'obama',
    name: L('Barack Obama', '버락 오바마'),
    enName: 'Barack Obama',
    party: 'D',
    branch: 'former',
    role: L('44th President', '제44대 미국 대통령'),
    state: 'IL',
    faction: 'dem-est',
    prominence: 9,
    buzz: 64,
    status: 'legacy',
    bio: L(
      'Still the party\'s heaviest broker. The 2008 Clinton war, the Biden bromance, and the quiet 2024 push to withdraw — he anchors every storyline.',
      '여전히 당내 최고 중량급 중재자. 2008년 힐러리와의 전쟁, 바이든과의 브로맨스, 그리고 2024년 조용한 사퇴 압박까지 — 모든 서사의 축.'
    ),
    tags: Larr(['Legacy broker', '레거시 중재자']),
  },
  {
    id: 'pence',
    name: L('Mike Pence', '마이크 펜스'),
    enName: 'Mike Pence',
    party: 'R',
    branch: 'former',
    role: L('48th Vice President', '제48대 부통령'),
    state: 'IN',
    faction: 'gop-est',
    prominence: 6,
    buzz: 38,
    status: 'departed',
    bio: L(
      'Certified the election on January 6th because the Constitution said so — and paid with his political life.',
      '1월 6일 헌법과 관행대로 인증을 수행해 트럼프와 결별한 "헌법의 사람". 그 대가로 당 내 정치 생명을 잃었다.'
    ),
    tags: Larr(['Jan-6 rupture', '1/6 결별']),
  },
];
