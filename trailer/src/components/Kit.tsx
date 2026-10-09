import type React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, H, MONO, SANS, W, clamp } from '../theme';

const OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** 장면 공통 배경: 아주 어두운 남색 + 양 진영 색의 희미한 빛 + 미세 격자 */
export const Backdrop: React.FC<{ warm?: number }> = ({ warm = 1 }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 240) * 80;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1600px 1100px at ${900 + drift}px 700px, rgba(242,85,99,${0.1 * warm}), transparent 70%),
                       radial-gradient(1700px 1200px at ${2950 - drift}px 1500px, rgba(79,143,247,${0.11 * warm}), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.line}33 2px, transparent 2px), linear-gradient(90deg, ${C.line}33 2px, transparent 2px)`,
          backgroundSize: '160px 160px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          opacity: 0.55,
        }}
      />
    </AbsoluteFill>
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)', pointerEvents: 'none' }} />
);

/** 단어 단위로 아래에서 떠오르는 헤드라인 */
export const Rise: React.FC<{
  text: string;
  at: number;
  size?: number;
  weight?: number;
  color?: string;
  stagger?: number;
  out?: number;
  style?: React.CSSProperties;
  mono?: boolean;
}> = ({ text, at, size = 150, weight = 800, color = C.ink, stagger = 4, out, style, mono }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeOut = out === undefined ? 1 : interpolate(frame, [out, out + 14], [1, 0], clamp);
  const words = text.split(' ');
  return (
    <div
      style={{
        fontFamily: mono ? MONO : SANS,
        fontSize: size,
        fontWeight: weight,
        color,
        letterSpacing: mono ? '0.06em' : '-0.025em',
        lineHeight: 1.12,
        opacity: fadeOut,
        wordBreak: 'keep-all',
        ...style,
      }}
    >
      {words.map((w, i) => {
        const s = spring({ frame: frame - at - i * stagger, fps, config: { damping: 200, mass: 0.6 } });
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.08em' }}>
            <span
              style={{
                display: 'inline-block',
                translate: `0 ${(1 - s) * 105}%`,
                opacity: interpolate(s, [0, 0.4], [0, 1], clamp),
              }}
            >
              {w}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** 작은 대문자 머리말 (모노) */
export const Kicker: React.FC<{ text: string; at: number; color?: string; out?: number; style?: React.CSSProperties }> = ({
  text,
  at,
  color = C.cosponsor,
  out,
  style,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 18], [0, 1], clamp) * (out === undefined ? 1 : interpolate(frame, [out, out + 14], [1, 0], clamp));
  const shown = Math.floor(interpolate(frame, [at, at + text.length * 1.2 + 6], [0, text.length], clamp));
  return (
    <div style={{ fontFamily: MONO, fontSize: 60, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color, opacity: o, ...style }}>
      <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 4, background: color, marginRight: 30, translate: '0 -6px' }} />
      {text.slice(0, shown)}
    </div>
  );
};

/** 0 → value 로 세는 숫자 */
export const Count: React.FC<{ value: number; at: number; dur?: number; decimals?: number; style?: React.CSSProperties; prefix?: string; suffix?: string }> = ({
  value,
  at,
  dur = 40,
  decimals = 0,
  style,
  prefix = '',
  suffix = '',
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + dur], [0, 1], { ...clamp, easing: OUT });
  const v = value * t;
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {prefix}
      {decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US')}
      {suffix}
    </span>
  );
};

/**
 * 실제 앱 캡처 (3840×2160, 화면을 꽉 채운다). focus 지점으로 천천히 밀고 들어간다.
 * 확대해도 이미지 밖이 보이지 않게 카메라를 가둔다.
 */
export const Shot: React.FC<{
  src: string;
  focus: [number, number];
  zoom: [number, number];
  start?: number;
  dur: number;
  dim?: number;
}> = ({ src, focus, zoom, start = 0, dur, dim = 0 }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + dur], [0, 1], { ...clamp, easing: Easing.bezier(0.45, 0, 0.2, 1) });
  const z = Math.max(1, zoom[0] + (zoom[1] - zoom[0]) * t);
  const halfW = W / 2 / z;
  const halfH = H / 2 / z;
  const cx = Math.min(Math.max(focus[0], halfW), W - halfW);
  const cy = Math.min(Math.max(focus[1], halfH), H - halfH);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: C.bg }}>
      <Img
        src={staticFile(src)}
        style={{
          position: 'absolute',
          width: W,
          height: H,
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          scale: String(z),
          translate: `${-(cx - halfW) * z}px ${-(cy - halfH) * z}px`,
        }}
      />
      {dim ? <AbsoluteFill style={{ backgroundColor: `rgba(3,6,12,${dim})` }} /> : null}
    </AbsoluteFill>
  );
};

/** 하단 자막 띠: 아래쪽을 어둡게 해 글자가 그래프나 캡처 위에서도 읽히게 */
export const Scrim: React.FC<{ from?: 'bottom' | 'top'; strength?: number }> = ({ from = 'bottom', strength = 0.92 }) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(to ${from === 'bottom' ? 'top' : 'bottom'}, rgba(3,6,12,${strength}) 0%, rgba(3,6,12,${strength * 0.75}) 22%, transparent 48%)`,
    }}
  />
);

export const fadeInOut = (frame: number, dur: number, edge = 10) =>
  interpolate(frame, [0, edge, dur - edge, dur], [0, 1, 1, 0], clamp);
