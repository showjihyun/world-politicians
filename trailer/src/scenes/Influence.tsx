import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop, Count, Kicker, Rise, Shot, Vignette } from '../components/Kit';
import { D, money, type Lang } from '../data';
import { copyFor } from '../copy';
import { BAR, BEAT, C, MONO, SANS, clamp } from '../theme';

/**
 * 인물 속성 레이어 (6마디). 돈은 유형별로 갈라서 그린다 — 반대 지출을 합치면 후원처럼 보인다.
 * 마지막 마디는 실제 프로필 화면(Massie)으로 끝낸다.
 */
const KIND_COLOR: Record<string, string> = { direct: C.D, for: C.ally, against: C.feud };

export const Influence: React.FC<{ lang: Lang }> = ({ lang }) => {
  const { fps } = useVideoConfig();
  const t = copyFor(lang);
  return (
    <AbsoluteFill>
      <Sequence name="Cards" durationInFrames={BAR * 4.5} premountFor={fps}>
        <Cards lang={lang} />
      </Sequence>
      <Sequence name="Profile" from={BAR * 4.5} durationInFrames={BAR * 1.5} premountFor={fps}>
        <Shot src={`ui/${lang}/05-influence.png`} focus={[3424, 1560]} zoom={[2.2, 2.6]} dur={BAR * 1.5} />
        <AbsoluteFill style={{ background: 'linear-gradient(to right, rgba(3,6,12,0.95) 0%, rgba(3,6,12,0.85) 38%, transparent 62%)' }} />
        <AbsoluteFill style={{ padding: '0 0 0 260px', justifyContent: 'center', width: 1900 }}>
          <Kicker text="PROFILE" at={2} color={C.gold} />
          <div style={{ height: 30 }} />
          <Rise text={t.infFoot} at={8} size={110} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

const Cards: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const t = copyFor(lang);
  const maxMoney = Math.max(...t.moneyRows.map((r) => r[1]));
  const card = (at: number): React.CSSProperties => {
    const o = interpolate(frame, [at, at + 16], [0, 1], clamp);
    return {
      flex: 1,
      padding: '60px 64px',
      borderRadius: 40,
      background: '#0c1322ee',
      border: `3px solid ${C.line}`,
      opacity: o,
      translate: `0 ${(1 - o) * 80}px`,
      display: 'flex',
      flexDirection: 'column',
    };
  };
  const head = (text: string, color: string) => (
    <div style={{ fontFamily: MONO, fontSize: 50, letterSpacing: '0.14em', color, textTransform: 'uppercase', marginBottom: 40 }}>{text}</div>
  );

  return (
    <AbsoluteFill>
      <Backdrop warm={0.6} />
      <AbsoluteFill style={{ padding: '190px 260px 0' }}>
        <Kicker text="INFLUENCE PROFILE" at={0} color={C.gold} />
        <div style={{ height: 30 }} />
        <Rise text={t.infTitle} at={6} size={130} />
      </AbsoluteFill>

      <div style={{ position: 'absolute', left: 260, right: 260, top: 640, bottom: 200, display: 'flex', gap: 60 }}>
        {/* 돈 */}
        <div style={{ ...card(BEAT * 2), flex: 1.5 }}>
          {head(`${t.money} · FEC 2026`, C.D)}
          {t.moneyRows.map(([label, v, kind], i) => {
            const at = BEAT * 3 + i * BEAT;
            const w = interpolate(frame, [at, at + 30], [0, v / maxMoney], { ...clamp, easing: Easing.out(Easing.cubic) });
            return (
              <div key={kind} style={{ marginBottom: 40 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 56, fontWeight: 600, color: C.ink }}>
                  <span>{label}</span>
                  <span style={{ color: KIND_COLOR[kind], fontWeight: 800 }}>{money(v)}</span>
                </div>
                <div style={{ height: 34, borderRadius: 17, background: '#162036', marginTop: 16 }}>
                  <div style={{ height: '100%', width: `${w * 100}%`, borderRadius: 17, background: KIND_COLOR[kind] }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 'auto', fontFamily: SANS, fontSize: 52, fontWeight: 600, color: C.feud, lineHeight: 1.35, opacity: interpolate(frame, [BEAT * 7, BEAT * 7 + 16], [0, 1], clamp) }}>
            {t.moneyNote}
          </div>
        </div>

        {/* 회전문 */}
        <div style={card(BEAT * 8)}>
          {head(t.lobby, C.bridge)}
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 260, color: C.bridge, lineHeight: 1 }}>
            <Count value={D.lobbying.matched} at={BEAT * 8} dur={50} />
          </div>
          <div style={{ fontFamily: SANS, fontSize: 58, fontWeight: 600, color: C.ink, marginTop: 30, lineHeight: 1.3 }}>{t.lobbyLine}</div>
          <div style={{ marginTop: 'auto', fontFamily: MONO, fontSize: 40, color: C.dim }}>
            HOUSE LD-1 · {D.lobbying.years[0]}–{D.lobbying.years[1]}
          </div>
        </div>

        {/* 당론 이탈 */}
        <div style={card(BEAT * 11)}>
          {head(t.defect, C.I)}
          <div style={{ fontFamily: SANS, fontSize: 58, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{t.defectLine}</div>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 260, color: C.I, lineHeight: 1, marginTop: 20 }}>
            <Count value={D.unity.collins.rate} at={BEAT * 11} dur={50} decimals={1} suffix="%" />
          </div>
          <div style={{ fontFamily: SANS, fontSize: 52, fontWeight: 500, color: C.sub, marginTop: 20 }}>{t.defectTail}</div>
          <div style={{ marginTop: 'auto', fontFamily: MONO, fontSize: 40, color: C.dim }}>VOTEVIEW · 119TH CONGRESS</div>
        </div>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};
