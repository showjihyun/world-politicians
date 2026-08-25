import type { Politician } from '../../types';
import { L, Larr } from '../L';

/**
 * Governors · Former · Legacy figures (dynasty & bipartisan anchors)
 */
export const OTHERS: Politician[] = [
  // ── Governors ──
  {
    id: 'newsom',
    name: L('Gavin Newsom', '개빈 뉴섬'),
    enName: 'Gavin Newsom',
    party: 'D',
    branch: 'governor',
    role: L('Governor of California', '캘리포니아 주지사'),
    state: 'CA',
    faction: 'dem-est',
    prominence: 8,
    buzz: 82,
    bio: L(
      'The "resistance governor" — passed the counter-gerrymander ballot measure and defied federal troop deployments. The Democratic frontrunner for 2028.',
      '트럼프의 게리맨더 역전 국민투표를 통과시키고 내셔널가드 파견을 정면 돌파한 "저항 주". 2028 민주당 예선 최대 후보.'
    ),
    tags: Larr(['2028 frontrunner', '2028 1순위']),
  },
  {
    id: 'whitmer',
    name: L('Gretchen Whitmer', '그레천 휘트머'),
    enName: 'Gretchen Whitmer',
    party: 'D',
    branch: 'governor',
    role: L('Governor of Michigan', '미시간 주지사'),
    state: 'MI',
    faction: 'dem-mod',
    prominence: 7,
    buzz: 62,
    bio: L(
      'Survived a kidnapping plot, won re-election big — the completed form of swing-state pragmatism.',
      '"그 미시간 여자"라 불리던 사람이 납치 음모까지 견디고 재선. 스윙스테이트 실용주의의 완성형.'
    ),
    tags: Larr(['2028', '2028']),
  },
  {
    id: 'pritzker',
    name: L('JB Pritzker', 'JB 프리츠커'),
    enName: 'JB Pritzker',
    party: 'D',
    branch: 'governor',
    role: L('Governor of Illinois', '일리노이 주지사'),
    state: 'IL',
    faction: 'dem-prog',
    prominence: 6,
    buzz: 60,
    bio: L(
      'Hyatt heir commanding the Chicago ICE stand-off; rode the "a kind, normal guy" self-intro meme into 2028 contention.',
      '하얏트 상속자이자 시카고 ICE 대치전의 사령관. "친절하고 정상적인" 자기소개 밈으로 부상한 2028 카드.'
    ),
    tags: Larr(['2028', '2028']),
  },
  {
    id: 'shapiro',
    name: L('Josh Shapiro', '조쉬 샤피로'),
    enName: 'Josh Shapiro',
    party: 'D',
    branch: 'governor',
    role: L('Governor of Pennsylvania', '펜실베이니아 주지사'),
    state: 'PA',
    faction: 'dem-mod',
    prominence: 7,
    buzz: 64,
    bio: L(
      'Lost the VP shortlist but kept Pennsylvania\'s highest approval ratings — the Jewish star governor of the Keystone State.',
      '해리스의 러닝메이트 경쟁에서 탈락했지만 펜실베이니아에서 가장 높은 지지율을 유지하는 유대인 스타 주지사.'
    ),
    tags: Larr(['2028', '2028']),
  },
  {
    id: 'walz',
    name: L('Tim Walz', '팀 월즈'),
    enName: 'Tim Walz',
    party: 'D',
    branch: 'governor',
    role: L('Governor of Minnesota · 2024 VP nominee', '미네소타 주지사 · 2024 VP 후보'),
    state: 'MN',
    faction: 'dem-mod',
    prominence: 6,
    buzz: 56,
    bio: L(
      'Coach-turned-VP nominee whose one word — "weird" — reframed an election. Still the Midwest\'s voice after defeat.',
      '"그들은 이상하다"는 한마디로 선거 구도를 바꾼 코치 출신 VP 후보. 패배 후에도 중서부 목소리로 남았다.'
    ),
    tags: Larr(['2024 VP', '2024 VP'], ['"Weird" framing', 'weird 프레임']),
  },
  {
    id: 'moore-wes',
    name: L('Wes Moore', '웨스 무어'),
    enName: 'Wes Moore',
    party: 'D',
    branch: 'governor',
    role: L('Governor of Maryland', '메릴랜드 주지사'),
    state: 'MD',
    faction: 'dem-mod',
    prominence: 5,
    buzz: 50,
    bio: L(
      'Rhodes Scholar, Army veteran, author — Obama\'s favorite next-gen leader, steering Baltimore\'s bridge rebuild.',
      '로즈 장학생 출신 전직 군인 저자. 오바마의 총애를 받으며 메릴랜드 재건(키 브릿지)을 지휘 중인 신성.'
    ),
    tags: Larr(['2028 dark horse', '2028 다크호스']),
  },
  {
    id: 'desantis',
    name: L('Ron DeSantis', '론 디샌티스'),
    enName: 'Ron DeSantis',
    party: 'R',
    branch: 'governor',
    role: L('Governor of Florida', '플로리다 주지사'),
    state: 'FL',
    faction: 'maga',
    prominence: 7,
    buzz: 58,
    bio: L(
      'Trump\'s fiercest challenger until a 30-point Iowa humiliation. Now isolated — even fighting his own legislature for 2028.',
      '트럼프의 최강 도전자였다가 30점짜리 아이오와 참패로 굴복. 이제 플로리다 의회와도 싸우는 고립된 2028 도전자.'
    ),
    tags: Larr(['2024 loser', '2024 패자']),
  },
  {
    id: 'abbott-greg',
    name: L('Greg Abbott', '그렉 애벗'),
    enName: 'Greg Abbott',
    party: 'R',
    branch: 'governor',
    role: L('Governor of Texas', '텍사스 주지사'),
    state: 'TX',
    faction: 'maga',
    prominence: 6,
    buzz: 48,
    bio: L(
      'Architect of the border war: razor wire vs federal agents, migrant busing to blue cities — constitutional brinkmanship as strategy.',
      '바이든 연방정부와 리저 와이어·부이 수로를 두고 헌법적 대치를 벌인 국경 전쟁의 설계자. 이민자 버스 전송 작전도 그의 손.'
    ),
    tags: Larr(['Border war', '국경 전쟁']),
  },

  // ── Former & Legacy ──
  {
    id: 'hillary',
    name: L('Hillary Clinton', '힐러리 클린턴'),
    enName: 'Hillary Clinton',
    party: 'D',
    branch: 'former',
    role: L('67th Secretary of State · 2016 nominee', '제67대 국무장관 · 2016 민주당 후보'),
    faction: 'dem-est',
    prominence: 8,
    buzz: 60,
    status: 'legacy',
    bio: L(
      'The 2016 civil war with Bernie, the "Russian asset" feud with Gabbard — the origin point of Democratic infighting narratives.',
      '버니와의 2016 내전, 개버드와의 "러시아 자산" 논쟁까지 — 민주당 갈등 서사의 원류. 여전히 진영의 큰 어른.'
    ),
    tags: Larr(['Clinton dynasty', '클린턴 왕조']),
  },
  {
    id: 'bill-clinton',
    name: L('Bill Clinton', '빌 클린턴'),
    enName: 'Bill Clinton',
    party: 'D',
    branch: 'former',
    role: L('42nd President', '제42대 미국 대통령'),
    faction: 'dem-est',
    prominence: 7,
    buzz: 44,
    status: 'legacy',
    bio: L(
      'Won on "It\'s the economy, stupid". Toasted by Obama, subpoenaed in Epstein files chatter — past power resurfacing.',
      '"경제, 멍청아"로 승리한 정치 동물. 오바마에게 축배를 들고, 에핀스타 소환장에 이름이 거론되며 다시 조명받는 과거 권력.'
    ),
    tags: Larr(['Clinton dynasty', '클린턴 왕조']),
  },
  {
    id: 'bush-w',
    name: L('George W. Bush', '조지 W. 부시'),
    enName: 'George W. Bush',
    party: 'R',
    branch: 'former',
    role: L('43rd President', '제43대 미국 대통령'),
    faction: 'gop-est',
    prominence: 7,
    buzz: 36,
    status: 'legacy',
    bio: L(
      'The last president of establishment GOP — now a silent critic whose silence testifies to how much the party changed.',
      '공화당 확장파 시대의 마지막 대통령. 트럼프 시대엔 침묵의 비판자가 되었고, 그 침묵이 당의 변화를 증언한다.'
    ),
    tags: Larr(['Bush dynasty', '부시 왕조']),
  },
  {
    id: 'jeb-bush',
    name: L('Jeb Bush', '젭 부시'),
    enName: 'Jeb Bush',
    party: 'R',
    branch: 'former',
    role: L('Former FL Governor · 2016 candidate', '前 플로리다 주지사 · 2016 후보'),
    faction: 'gop-est',
    prominence: 5,
    buzz: 24,
    status: 'legacy',
    bio: L(
      'The presumptive 2016 frontrunner broken live on stage by one phrase: "low energy".',
      '"low energy" 모욕으로 트럼프에게 처음으로 왕조를 깨진 당시 최대 유력 후보.'
    ),
    tags: Larr(['Bush dynasty', '부시 왕조']),
  },
  {
    id: 'dick-cheney',
    name: L('Dick Cheney', '딕 체니'),
    enName: 'Dick Cheney',
    party: 'R',
    branch: 'former',
    role: L('46th Vice President', '제46대 부통령'),
    faction: 'gop-est',
    prominence: 6,
    buzz: 34,
    status: 'legacy',
    bio: L(
      'The neocon heart of the Iraq War who, in his final years, called Trump "the greatest threat" — in his daughter\'s campaign ad.',
      '이라크 전쟁의 설계자였던 네온콘의 심장이, 말년에는 트럼프을 "역사상 최대 위협"이라 부르며 딸의 선거광고에 나섰다.'
    ),
    tags: Larr(['Cheney dynasty', '체니 왕조'], ['Neocon', '네온콘']),
  },
  {
    id: 'liz-cheney',
    name: L('Liz Cheney', '리즈 체니'),
    enName: 'Liz Cheney',
    party: 'R',
    branch: 'former',
    role: L('Former Conference Chair · Jan-6 vice chair', '前 하원 회의 의장 · 1/6 위원회 부위원장'),
    faction: 'gop-est',
    prominence: 7,
    buzz: 58,
    status: 'departed',
    bio: L(
      'Ousted from leadership #3, then purged in a primary by 40 points — the sacrificial emblem. Also on Biden\'s preemptive pardon list.',
      '원내 3위에서 추방당하고, 본선이 아니라 예선에서 40점 차로 숙청된 희생양. 바이든의 예방적 사면 명단에도 올랐다.'
    ),
    tags: Larr(['Purge symbol', '숙청 상징'], ['Jan-6 committee', '1/6 위원회']),
  },
  {
    id: 'kinzinger',
    name: L('Adam Kinzinger', '애덤 킨징거'),
    enName: 'Adam Kinzinger',
    party: 'R',
    branch: 'former',
    role: L('Former Rep · Jan-6 committee', '前 하원의원 · 1/6 위원회'),
    faction: 'gop-est',
    prominence: 5,
    buzz: 44,
    status: 'departed',
    bio: L(
      'Air Force pilot who chose the Jan-6 committee over re-election — and lives with weekly death threats as the price.',
      '재선을 포기하고 1/6 위원회에서 싸운 공군 조종사. 매주 죽음 협박 메일을 받는 삶을 감수한 선택.'
    ),
    tags: Larr(['Jan-6 committee', '1/6 위원회']),
  },
  {
    id: 'romney',
    name: L('Mitt Romney', '밋 롬니'),
    enName: 'Mitt Romney',
    party: 'R',
    branch: 'former',
    role: L('Former UT Senator · 2012 nominee', '前 유타 상원의원 · 2012 대선후보'),
    faction: 'gop-est',
    prominence: 6,
    buzz: 38,
    status: 'departed',
    bio: L(
      'The only GOP senator to convict in impeachment I — the last hand on McCain\'s torch of institutionalism.',
      '탄핵 1차에서 유일하게 유죄표를 던진 같은 당 대선후보. 매케인의 횃불을 마지막으로 받든 제도주의자.'
    ),
    tags: Larr(['McCain successor', '매케인 계승자']),
  },
  {
    id: 'mccain-john',
    name: L('John McCain', '존 매케인'),
    enName: 'John McCain',
    party: 'R',
    branch: 'former',
    role: L('Former Senator · 2008 nominee', '前 상원의원 · 2008 대선후보'),
    faction: 'gop-est',
    prominence: 7,
    buzz: 40,
    status: 'legacy',
    bio: L(
      'POW-turned-war-hero. The thumbs-down vote that saved the ACA — and a Trump feud that outlived him — made him the spiritual benchmark of the GOP civil war.',
      '포로 출신 전쟁영웅. ACA 폐지를 살리는 "엄지 아래" 표결과 사후까지 이어지는 트럼프과의 불구속 관계로 GOP 내전의 영적 기준점이 되었다.'
    ),
    tags: Larr(['In memoriam (1936–2018)', '고인 (1936–2018)'], ['Thumbs down', '엄지 아래']),
  },
  {
    id: 'manchin',
    name: L('Joe Manchin', '조 맨친'),
    enName: 'Joe Manchin',
    party: 'I',
    branch: 'former',
    role: L('Former WV Senator', '前 웨스트버지니아 상원의원'),
    faction: 'dem-mod',
    prominence: 6,
    buzz: 42,
    status: 'departed',
    bio: L(
      'The decider of the 50-50 Senate who sank Build Back Better single-handedly — when golf with Romney mattered more than caucus discipline.',
      '50-50 상원에서 바이든의 Build Back Better를 홀로 저지한 결정권자. 롬니와의 골프 우정이 입법보다 빨랐던 시대의 상징.'
    ),
    tags: Larr(['Kingmaker', '결정권자']),
  },
  {
    id: 'sinema',
    name: L('Kyrsten Sinema', '키르스텐 시네마'),
    enName: 'Kyrsten Sinema',
    party: 'I',
    branch: 'former',
    role: L('Former AZ Senator', '前 애리조나 상원의원'),
    faction: 'independent',
    prominence: 5,
    buzz: 34,
    status: 'departed',
    bio: L(
      'From pink wing to independent — defending the filibuster made her progressive enemy #1.',
      '핑크 윙에서 무소속으로. 필리버스터 수호 선언으로 좌파의 미워하는 사람 1호가 되었다.'
    ),
    tags: Larr(['Independent', '무소속']),
  },
  {
    id: 'gaetz-matt',
    name: L('Matt Gaetz', '맷 개츠'),
    enName: 'Matt Gaetz',
    party: 'R',
    branch: 'former',
    role: L('Former Rep · withdrawn AG nominee', '前 하원의원 · AG 지명 철회'),
    faction: 'maga',
    prominence: 5,
    buzz: 46,
    status: 'departed',
    bio: L(
      'Dragged McCarthy into history\'s first Speaker removal — then watched his own AG nomination die against the ethics report wall.',
      '맥카시를 하원 역사상 처음으로 해임 표결까지 끌고 간 반군. AG 지명은 윤리 보고서의 벽 앞에서 철회됐다.'
    ),
    tags: Larr(['Rebel', '반란군']),
  },
  {
    id: 'mccarthy-kevin',
    name: L('Kevin McCarthy', '케빈 맥카시'),
    enName: 'Kevin McCarthy',
    party: 'R',
    branch: 'former',
    role: L('55th Speaker (first ever removed)', '第55代 하원의장 (역사상 첫 해임)'),
    faction: 'gop-est',
    prominence: 6,
    buzz: 40,
    status: 'departed',
    bio: L(
      'Won the gavel on the 15th ballot, lost it to Gaetz — the paradox of loyalty: purged Cheney, bowed to Trump, removed anyway.',
      '15차례 표결 끝에 얻은 의장 자리를 개츠 때문에 잃은 남자. 체니 해임, 트럼프 화해, 그리고 몰락까지 — 충성의 역설을 상징.'
    ),
    tags: Larr(['First removed Speaker', '첫 해임 의장']),
  },
  {
    id: 'haley-nikki',
    name: L('Nikki Haley', '니키 헤일리'),
    enName: 'Nikki Haley',
    party: 'R',
    branch: 'former',
    role: L('29th UN Ambassador · 2024 candidate', '第29代 UN 대사 · 2024 후보'),
    faction: 'gop-est',
    prominence: 6,
    buzz: 44,
    status: 'departed',
    bio: L(
      'Shook Trump through Iowa and New Hampshire — the last establishment candidate still hiding her true feelings on the trail.',
      '아이오와·뉴햄프셔에서 트럼프를 흔들어댔지만 본심을 숨긴 채 경합을 이어간 마지막 원내파 후보.'
    ),
    tags: Larr(['2024 candidate', '2024 후보']),
  },
  {
    id: 'buttigieg',
    name: L('Pete Buttigieg', '피트 부티지지'),
    enName: 'Pete Buttigieg',
    party: 'D',
    branch: 'former',
    role: L('Former Transportation Secretary · 2020 candidate', '前 교통부 장관 · 2020 후보'),
    faction: 'dem-mod',
    prominence: 6,
    buzz: 52,
    bio: L(
      'Afghanistan veteran and center-left star — the "Midwestern moderate" option colliding head-on with Newsom for 2028.',
      '아프간 참전 용사 출신 센터-레프트 스타. 2028 예선에서 뉴섬과 정면으로 겹치는 "중서부 온건" 옵션.'
    ),
    tags: Larr(['2028', '2028']),
  },
];
