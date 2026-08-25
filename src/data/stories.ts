import type { Story } from '../types';
import { L } from './L';

/**
 * 7 curated "social phenomena" guided tours
 */
export const STORIES: Story[] = [
  {
    id: 'gravity',
    emoji: '🛰️',
    title: L('The Mar-a-Lago Gravity Well', '마라라고 중력장'),
    subtitle: L('When one node holds the whole network together', '하나의 노드가 네트워크 전체를 붙들 때'),
    focusIds: [
      'trump', 'vance', 'rubio', 'hegseth', 'noem', 'rfk-jr', 'gabbard', 'bondi',
      'johnson-mike', 'scalise', 'stefanik', 'jordan-jim', 'mtg', 'boebert', 'luna',
      'mace-nancy', 'donalds', 'cruz', 'hawley', 'graham', 'thune', 'tuberville',
      'moreno', 'rick-scott', 'tim-scott', 'lee-mike', 'blackburn', 'schmitt', 'abbott-greg',
    ],
    paragraphs: [
      L(
        'Zoom out and one shape dominates: a hub with dozens of spokes. Cabinet members, House leadership, Senate loyalists — all edges route through a single man who has never held a lowly committee chair.',
        '줌아웃하면 하나의 형태가 지배합니다: 수십 개의 축이 꽂힌 허브. 각료, 하원 지도부, 상원 충성파 — 미미한 위원장직도 거쳐본 적 없는 한 남자로 모든 엣지가 모입니다.'
      ),
      L(
        'Hub-and-spoke networks are efficient but fragile. Loyalty is priced daily; when MTG or Musk broke away, they didn\'t defect to another party — they simply fell out of orbit.',
        '허브-스포크 네트워크는 효율적이지만 취약합니다. 충성심은 매일 시세가 매겨지고, MTG나 머스크가 이탈할 때 그들은 다른 당으로 가지 않았습니다 — 그냥 궤도에서 떨어졌을 뿐이죠.'
      ),
      L(
        'Notice there are almost no edges *between* the spokes. Remove the hub and the network doesn\'t split in two — it atomizes. That is the structural risk of personalized parties.',
        '스포크들 *사이*에는 엣지가 거의 없다는 점에 주목하세요. 허브를 제거하면 네트워크는 둘로 갈라지지 않고 원자화됩니다. 개인화된 정당의 구조적 리스크입니다.'
      ),
    ],
    insight: L(
      'Personalization beats institutionalization in modern politics — until it doesn\'t.',
      '현대 정치에서 개인화는 조직화를 이긴다 — 깨질 때까지는.'
    ),
  },
  {
    id: 'gop-civil-war',
    emoji: '🐘',
    title: L('GOP Civil War: The Purge Era', 'GOP 내전: 숙청의 시대'),
    subtitle: L('Cheney out, Tillis out, Ernst out — loyalty as survival', '체니 아웃, 틸리스 아웃, 어니스트 아웃 — 생존으로서의 충성'),
    focusIds: [
      'trump', 'mcconnell', 'thune', 'liz-cheney', 'dick-cheney', 'kinzinger', 'romney',
      'mccain-john', 'murkowski', 'collins-susan', 'cassidy', 'tillis', 'ernst',
      'massie', 'mtg', 'boebert', 'luna', 'mace-nancy', 'gaetz-matt', 'mccarthy-kevin',
      'johnson-mike', 'pence', 'haley-nikki', 'stefanik', 'emmer', 'scalise',
    ],
    paragraphs: [
      L(
        'Follow the red feud lines inside one party: impeachment votes became primary challenges; committee seats became excommunication. Cheney purged, Kinzinger gone, Romney retired — and by 2026 even Massie, the last rebel, fell to a revenge primary.',
        '한 정당 안의 붉은 갈등선을 따라가 보세요: 탄핵 표는 예선 도전이 되었고, 위원회 자리는 파문이 되었습니다. 체니 숙청, 킨징거 퇴장, 롬니 은퇴 — 그리고 2026년엔 마지막 반란군 매시마저 보복 예선에 넘어졌습니다.'
      ),
      L(
        'But look closer at MAGA\'s own feuds: Boebert vs MTG, Luna vs MTG, Mace vs everyone, Massie vs Trump himself. The purge tool doesn\'t stay pointed outward forever.',
        '그러나 MAGA 내부의 불호도 보세요: 보버트 vs MTG, 루나 vs MTG, 메이스 vs 전원, 그리고 매시 vs 트럼프 본인. 숙청 도구는 영원히 바깥만 겨누지 않습니다.'
      ),
      L(
        'McConnell\'s exit line — "a party of fear and ignorance" — is what a defeated strategist sounds like. The establishment didn\'t lose an argument; it lost its voters.',
        '맥코널의 퇴장 대사 — "공포와 무지의 당" — 은 패배한 전략가의 목소리입니다. 원내파는 논쟁에서 진 게 아니라 유권자를 잃은 겁니다.'
      ),
    ],
    insight: L(
      'Primary elections, not general elections, are where parties now fight their real wars.',
      '정당의 진짜 전쟁은 본선이 아니라 예선에서 벌어진다.'
    ),
  },
  {
    id: 'dem-generations',
    emoji: '🫏',
    title: L('Democratic Generational War', '민주당 세대전쟁'),
    subtitle: L('Pelosi & Schumer vs AOC & the Squad — and Fetterman walks off', '펠로시·슈머 vs AOC·스쿼드 — 그리고 페터먼은 무대를 떠난다'),
    focusIds: [
      'schumer', 'pelosi', 'jeffries', 'aoc', 'omar-ilhan', 'tlaib', 'pressley',
      'fetterman', 'sanders', 'warren', 'khanna', 'torres-ritchie', 'golden-jared',
      'perez-marie', 'crockett', 'frost-maxwell', 'markey', 'harris', 'newsom', 'durbin', 'kim-andy', 'booker',
    ],
    paragraphs: [
      L(
        'A party that lost three straight national races is renegotiating its soul in public. Schumer faces a possible AOC primary; Pelosi\'s last act was engineering Biden\'s exit while withholding endorsement from his successor.',
        '국정 선거를 연속으로 잃은 정당은 공개적으로 자기 영혼을 재협상 중입니다. 슈머는 AOC 경선 설움에 놓였고, 펠로시의 마지막 행보는 바이든 사퇴 설계와 후계자에 대한 지지 보류였습니다.'
      ),
      L(
        'The Squad axis (green) fights two fronts: Trump outside, Fetterman-Torres-Golden moderates inside. Golden voted for Republican Mike Johnson for Speaker — from within the Democratic caucus.',
        '스쿼드 축(녹색)은 두 전선에서 싸웁니다: 밖의 트럼프, 안의 페터먼·토레스·골든 온건파. 골든은 민주 원내에서 공화당 존슨에게 의장표를 던졌죠.'
      ),
      L(
        'Meanwhile the Sanders-AOC Oligarchy tour draws stadium crowds — energy without yet a machine. The generational question isn\'t left vs right; it\'s movement vs institution.',
        '한편 버니-AOC 올리가르히 투어는 스타디움 관중을 모읍니다 — 아직 조직 없는 에너지죠. 세대 문제는 좌 vs 우가 아니라 운동 vs 조직의 문제입니다.'
      ),
    ],
    insight: L(
      'Losing parties don\'t converge on a center — they fragment into futures.',
      '패배한 정당은 중도로 수렴하지 않는다 — 여러 미래로 파편화된다.'
    ),
  },
  {
    id: 'bridges',
    emoji: '🌉',
    title: L('Bipartisan Bridges: Endangered Species', '초당적 다리: 멸종위기 종'),
    subtitle: L('McCain-Biden, Romney-Manchin — friendships that used to legislate', '매케인-바이든, 롬니-맨친 — 입법하던 우정들'),
    focusIds: [
      'mccain-john', 'biden', 'romney', 'manchin', 'sinema', 'collins-susan',
      'murkowski', 'durbin', 'graham', 'hawley', 'aoc', 'fetterman', 'golden-jared',
      'fitzpatrick', 'bacon-don', 'whitmer', 'bush-w', 'pelosi', 'kelly-mark', 'cassidy',
      'massie', 'khanna',
    ],
    paragraphs: [
      L(
        'Amber lines are rare here — deliberately so. McCain\'s thumb-down saved the ACA with Democrats; Romney and Manchin legislated over golf; Durbin and Graham wrote immigration bills nobody can pass anymore.',
        '앰버색 선은 여기서 드물게 나타납니다 — 일부러 그렇게 만든 지형이죠. 매케인의 엄지 아래 표결은 ACA를 살렸고, 롬니와 맨친은 골프를 치며 입법했고, 더빈과 그레이엄은 이제 아무도 통과시키지 못하는 이민법을 썼습니다.'
      ),
      L(
        'Watch what happened to each bridge-builder: Manchin retired, Sinema retired, Romney retired, McCain passed away. Crossing the aisle became electorally fatal in primaries.',
        '다리 건설자들에게 무슨 일이 있었는지 보세요: 맨친 은퇴, 시네마 은퇴, 롬니 은퇴, 매케인 서거. 길 건너 악수는 예선에서 치명적으로 변했습니다.'
      ),
      L(
        'The surviving bridges are transactional, not personal: Hawley-AOC on stock trading bans, Fetterman-Trump over dinner. Deals without friendship — the network\'s weakest but most surprising edges.',
        '남아있는 다리는 개인이 아닌 거래입니다: 홀리-AOC 주식거래 금지, 페터먼-트럼프 만찬. 우정 없는 거래 — 네트워크에서 가장 약하지만 가장 놀라운 엣지들.'
      ),
      L(
        'And late 2025 proved bridges can still pass laws: Massie and Khanna carried the Epstein Files Transparency Act through the House 427-1 — a Republican libertarian and a California progressive, legislating together.',
        '그리고 2025년 말, 다리가 여전히 법을 통과시킬 수 있음이 증명됐습니다: 매시와 커나가 에핀스타 파일 투명성법을 하원 427-1로 통과시켰죠 — 공화당 자유지상파와 캘리포니아 진보가 함께 입법했습니다.'
      ),
    ],
    insight: L(
      'When friendship leaves legislation, only hostage-taking remains.',
      '우정이 입법을 떠나면 인질극만 남는다.'
    ),
  },
  {
    id: 'musk-shock',
    emoji: '💥',
    title: L('The Musk Shock: 130 Days', '머스크 쇼크: 130일의 동맹'),
    subtitle: L('Money met power met ego — then detonated', '돈과 권력과 자아가 만났다 — 그리고 폭발했다'),
    focusIds: ['musk', 'trump', 'vance', 'bannon', 'rubio', 'warren', 'newsom', 'paul-rand', 'walz'],
    paragraphs: [
      L(
        'The fastest alliance-building in political history: $250M spent, a department invented (DOGE), cabinet access granted. The fastest collapse too — subsidy grievances to Epstein-bomb posts in 48 hours. Then the strangest twist: by January 2026 they were posting dinner photos together, and by August Musk was back with a nine-figure midterm war chest.',
        '정치사상 가장 빠른 동맹 구축: 2억 5천만 달러 지출, 부서 신설(DOGE), 내각 접근권. 그리고 가장 빠른 붕괴 — 보조금 서러움부터 에핀스타 폭탄 트윗까지 48시간. 기묘한 반전까지: 2026년 1월엔 만찬 사진을 나란히 올리고, 8월엔 9자리 수 중간선거 자금과 복귀했다.'
      ),
      L(
        'Note how Musk feuds radiate beyond Trump: Bannon\'s movement-vs-billionaires war, Rubio humiliated in cabinet, Warren demanding audits, Walz cheering Tesla\'s slide. One actor, seven battlefronts.',
        '머스크의 불호가 트럼프 너머로 퍼지는 걸 보세요: 배넌의 운동-vs억만장자 전쟁, 내각에서 굴욕당한 루비오, 감사 요구하는 워런, 테슬라 하락을 환호한 월즈. 한 명의 행위자, 일곱 개의 전선.'
      ),
      L(
        'He still owns the platform where the fight happened. In this graph he\'s grey — no party, no office — yet his node outweighs most senators\' combined degree. Unelected gravity is real.',
        '그는 싸움이 벌어진 플랫폼을 여전히 소유합니다. 이 그래프에서 그는 회색 — 정당도 직책도 없지만 — 그런데도 그의 노드는 상원의원 여럿의 연결 합보다 큽니다. 비선출 중력은 실재합니다.'
      ),
    ],
    insight: L(
      'Platform ownership converts money into political gravity — and grudges into missiles.',
      '플랫폼 소유는 돈을 정치적 중력으로 — 원한을 미사일로 바꾼다.'
    ),
  },
  {
    id: 'dynasties',
    emoji: '👑',
    title: L('Political Dynasties', '정치 왕조'),
    subtitle: L('Bush, Clinton, Cheney, Kennedy — the family business', '부시, 클린턴, 체니, 케네디 — 가업으로서의 정치'),
    focusIds: [
      'bush-w', 'jeb-bush', 'hillary', 'bill-clinton', 'dick-cheney', 'liz-cheney',
      'rfk-jr', 'pelosi', 'newsom', 'mccain-john', 'romney',
    ],
    paragraphs: [
      L(
        'Purple dashed lines are bloodlines: Bush brothers, Cheney father-daughter, Clinton spouses. Add RFK Jr — a dynasty name now running health policy as a vaccine skeptic — and four family brands still occupy top offices.',
        '보라 점선은 혈통입니다: 부시 형제, 체니 부녀, 클린턴 부부. 그리고 백신 회의론자로 보건정책을 관장하는 왕조의 이름 RFK Jr까지 — 네 개의 가문 브랜드가 아직 요직을 점하고 있습니다.'
      ),
      L(
        'But dynasties are being re-priced. Jeb was broken by "low energy". Liz Cheney wasn\'t beaten by a Democrat but by her own party\'s base. Name recognition now cuts both ways.',
        '그러나 왕조의 시세가 재조정되고 있습니다. 젭은 "low energy"에 부서졌고, 리즈 체니는 민주당이 아니라 자기 당 기반에게 패했습니다. 이름값은 이제 양날의 검입니다.'
      ),
      L(
        'One lineage quietly persists: Pelosi → Newsom via the San Francisco machine. Dynasty isn\'t always blood; sometimes it\'s mentorship infrastructure.',
        '한 계보는 조용히 지속됩니다: 샌프란시스코 기계를 통한 펠로시 → 뉴섬. 왕조가 늘 피가 아닙니다; 때론 멘토십 인프라입니다.'
      ),
    ],
    insight: L(
      'Dynasty brand value survives — but only for those the base chooses to keep.',
      '왕조 브랜드 가치는 살아남는다 — 다만 기반이 남기로 택한 자들만.'
    ),
  },
  {
    id: 'rookie-warmup',
    emoji: '🎲',
    title: L('2028: The Rookie Warm-Up', '2028: 루키 워밍업'),
    subtitle: L('Pre-primary feuds among people who aren\'t even running yet', '아직 출마 선언도 안 한 사람들의 예비전 불호'),
    focusIds: [
      'newsom', 'harris', 'shapiro', 'whitmer', 'pritzker', 'moore-wes', 'buttigieg',
      'vance', 'rubio', 'desantis', 'cruz', 'hawley', 'donalds', 'tim-scott', 'booker', 'aoc',
    ],
    paragraphs: [
      L(
        'These feud lines haven\'t earned themselves yet. Newsom-Harris is a California cold war; Newsom-Shapiro and Buttigieg-Harris shadow-box nationally; Whitmer checks everyone quietly from Michigan.',
        '이 불호선들은 아직 값어치를 증명하지 못했습니다. 뉴섬-해리스는 캘리포니아 냉전이고, 뉴섬-샤피로와 부티지지-해리스는 전국적으로 그림자 흉기를 휘두릅니다. 휘트머는 미시간에서 조용히 모두를 견제하죠.'
      ),
      L(
        'On the right, Vance sits where Pence once did — heir apparent with a 2028 clock ticking. Cruz, Hawley, and Donalds position themselves as populist alternatives if the succession stumbles.',
        '우파에서 밴스는 옛 펜스의 자리에 앉았습니다 — 2028 카운트다운이 도는 사실상의 후계자. 크루즈, 홀리, 도널즈는 승계가 삐걱대면 포퓰리스트 대안으로 포지셔닝합니다.'
      ),
      L(
        'Social phenomenon to watch: pre-rivalry feuds predict coalition math better than polls. Who snipes at whom today reveals tomorrow\'s attack ads.',
        '주목할 현상: 예비 경쟁 불호는 여론조사보다 연합 산수를 잘 예측합니다. 오늘 누가 누구를 저격하는지가 내일의 공격 광고를 보여줍니다.'
      ),
    ],
    insight: L(
      'Presidential campaigns begin as feuds between friends-of-friends.',
      '대선 캠페인은 친구의 친구 사이 불호로 시작된다.'
    ),
  },
];
