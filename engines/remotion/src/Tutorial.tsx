import React from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import type { Timeline, TStep } from '../../shared/types';
import { cameraAt, cameraTransform } from '../../shared/camera';

/**
 * Plantilla de tutorial para Remotion. Todo sale de timeline.json:
 * intro de marca → grabación en marco de navegador con cámara (zoom/paneo) →
 * rótulos de paso → subtítulos → outro con CTA. Audio = mezcla final.
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const useSec = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

const Background: React.FC<{ t: Timeline }> = ({ t }) => {
  const s = useSec();
  const b = t.brand;
  const dx = Math.sin(s / 6) * 8, dy = Math.cos(s / 7) * 6;
  return (
    <AbsoluteFill style={{
      background: `radial-gradient(1400px 900px at ${78 + dx}% ${12 + dy}%, ${b.primary}55, transparent 60%),
        radial-gradient(1100px 800px at ${8 - dx}% ${96 - dy}%, ${b.secondary}38, transparent 60%), ${b.background}`,
    }}>
      <AbsoluteFill style={{
        backgroundImage: `linear-gradient(${b.text}08 1px, transparent 1px), linear-gradient(90deg, ${b.text}08 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
      }} />
    </AbsoluteFill>
  );
};

const Logo: React.FC<{ t: Timeline; height: number; style?: React.CSSProperties }> = ({ t, height, style }) =>
  t.brand.logo ? <Img src={staticFile(t.brand.logo)} style={{ height, objectFit: 'contain', ...style }} /> : null;

const Intro: React.FC<{ t: Timeline }> = ({ t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = t.brand;
  const dur = t.intro.duration * fps;
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const out = interpolate(frame, [dur - 0.5 * fps, dur], [1, 0], clamp);
  const words = t.intro.title.split(' ');
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, transform: `scale(${1 + (1 - out) * 0.04})` }}>
      <div style={{ textAlign: 'center', maxWidth: 1400, color: b.text }}>
        <div style={{ transform: `scale(${0.6 + enter * 0.4})`, opacity: enter, marginBottom: 36 }}>
          {t.brand.logo ? <Logo t={t} height={96} /> : (
            <div style={{ display: 'inline-block', padding: '10px 22px', borderRadius: 999, background: `${b.primary}`, color: '#fff', fontSize: 26, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>Tutorial</div>
          )}
        </div>
        <h1 style={{ fontSize: words.join(' ').length > 38 ? 84 : 104, lineHeight: 1.04, fontWeight: 900, letterSpacing: '-0.035em', margin: 0 }}>
          {words.map((w, i) => {
            const sp = spring({ frame: frame - 6 - i * 3, fps, config: { damping: 18, mass: 0.6 } });
            return <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - sp) * 50}px)`, opacity: sp, marginRight: '0.25em' }}>{w}</span>;
          })}
        </h1>
        <div style={{ height: 8, width: interpolate(frame, [12, 40], [0, 220], { ...clamp, easing: Easing.out(Easing.cubic) }), background: `linear-gradient(90deg, ${b.primary}, ${b.secondary})`, borderRadius: 8, margin: '34px auto 0' }} />
        {t.intro.subtitle && (
          <p style={{ fontSize: 40, color: b.mutedText, marginTop: 30, opacity: interpolate(frame, [18, 36], [0, 1], clamp) }}>{t.intro.subtitle}</p>
        )}
      </div>
    </AbsoluteFill>
  );
};

const StepBadge: React.FC<{ t: Timeline; step: TStep }> = ({ t, step }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = (step.end - step.start) * fps;
  const sp = spring({ frame, fps, config: { damping: 20, mass: 0.7 } });
  const out = interpolate(frame, [dur - 0.35 * fps, dur], [1, 0], clamp);
  const { screen } = t.layout;
  const b = t.brand;
  return (
    <div style={{
      position: 'absolute', top: screen.y + 26, display: 'flex', alignItems: 'center', gap: 16,
      ...(step.badgeSide === 'right' ? { right: t.width - (screen.x + screen.w) + 28 } : { left: screen.x + 28 }),
      padding: '12px 26px 12px 12px', borderRadius: 999, background: `${b.surface}E6`, color: b.text,
      boxShadow: '0 12px 30px rgba(0,0,0,.35)', border: `1px solid ${b.text}22`, backdropFilter: 'blur(10px)',
      transform: `translateX(${(1 - sp) * (step.badgeSide === 'right' ? 40 : -40)}px)`, opacity: Math.min(sp, out), fontSize: 30, fontWeight: 700,
    }}>
      <span style={{ width: 46, height: 46, borderRadius: '50%', background: b.primary, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 900 }}>{step.index}</span>
      {step.title}
    </div>
  );
};

const Screen: React.FC<{ t: Timeline }> = ({ t }) => {
  const s = useSec();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { screen, chromeH, browserFrame } = t.layout;
  const b = t.brand;
  const local = frame - Math.round((t.recording.start - 0.4) * fps);
  const enter = spring({ frame: local, fps, config: { damping: 200 } });
  const endF = (t.outro.start + 0.4 - (t.recording.start - 0.4)) * fps;
  const exit = interpolate(local, [endF - 0.5 * fps, endF], [1, 0], clamp);
  const cam = cameraTransform(cameraAt(t.camera, s), screen.w, screen.h);
  const progress = interpolate(s, [t.recording.start, t.recording.start + t.recording.duration], [0, 1], clamp);
  const r = t.brand.radius;
  return (
    <AbsoluteFill style={{ opacity: Math.min(enter, exit), transform: `scale(${0.94 + 0.06 * enter}) translateY(${(1 - enter) * 30}px)` }}>
      <div style={{
        position: 'absolute', left: screen.x, top: screen.y - chromeH, width: screen.w, height: screen.h + chromeH,
        borderRadius: r, overflow: 'hidden', background: b.surface,
        boxShadow: `0 50px 100px rgba(0,0,0,.5), 0 0 0 1px ${b.text}1f`,
      }}>
        {browserFrame && (
          <div style={{ height: chromeH, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', background: b.surface }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 14, height: 14, borderRadius: '50%', background: c }} />)}
            <div style={{ marginLeft: 24, flex: 1, maxWidth: 760, height: chromeH * 0.62, borderRadius: 999, background: `${b.text}12`, color: b.mutedText, fontSize: chromeH * 0.36, display: 'flex', alignItems: 'center', padding: '0 18px' }}>
              🔒&nbsp; {t.displayUrl}
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', left: 0, top: chromeH, width: screen.w, height: screen.h, overflow: 'hidden', background: '#fff' }}>
          <div style={{ width: screen.w, height: screen.h, transformOrigin: '0 0', transform: cam.css }}>
            <Sequence from={Math.round(t.recording.start * fps)} durationInFrames={Math.ceil(t.recording.duration * fps)} layout="none">
              <OffthreadVideo src={staticFile(t.recording.src)} muted style={{ width: screen.w, height: screen.h, display: 'block' }} />
            </Sequence>
          </div>
          <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: `${progress * 100}%`, background: `linear-gradient(90deg, ${b.primary}, ${b.secondary})` }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ t: Timeline; text: string; dur: number; top?: boolean }> = ({ t, text, dur, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = interpolate(frame, [0, 4, dur * fps - 4, dur * fps], [0, 1, 1, 0], clamp);
  const { screen } = t.layout;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: top ? screen.y + 110 : screen.y + screen.h - 130, display: 'flex', justifyContent: 'center', opacity: op }}>
      <div style={{
        maxWidth: screen.w * 0.8, padding: '14px 30px', borderRadius: 16, background: 'rgba(8,10,18,.82)', color: '#fff',
        fontSize: 42, fontWeight: 600, lineHeight: 1.25, textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,.35)',
        transform: `translateY(${(1 - op) * 8}px)`,
      }}>{text}</div>
    </div>
  );
};

const Outro: React.FC<{ t: Timeline }> = ({ t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = t.brand;
  const sp = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const fade = (d: number) => interpolate(frame, [d, d + 14], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', color: b.text, textAlign: 'center' }}>
      <div style={{ width: 150, height: 150, borderRadius: '50%', background: `linear-gradient(135deg, ${b.primary}, ${b.secondary})`, display: 'grid', placeItems: 'center', transform: `scale(${sp})`, boxShadow: `0 20px 60px ${b.primary}66` }}>
        <svg width="80" height="80" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="24" strokeDashoffset={24 - 24 * interpolate(frame, [8, 26], [0, 1], clamp)} /></svg>
      </div>
      <h2 style={{ fontSize: 92, fontWeight: 900, letterSpacing: '-0.03em', margin: '44px 0 0', opacity: fade(10) }}>{t.outro.title}</h2>
      {t.outro.subtitle && <p style={{ fontSize: 40, color: b.mutedText, marginTop: 18, opacity: fade(16) }}>{t.outro.subtitle}</p>}
      {t.outro.cta && (
        <div style={{ marginTop: 44, padding: '20px 44px', borderRadius: 999, background: b.primary, color: '#fff', fontSize: 36, fontWeight: 800, opacity: fade(22), transform: `translateY(${(1 - fade(22)) * 20}px)` }}>{t.outro.cta}</div>
      )}
      <Logo t={t} height={64} style={{ marginTop: 56, opacity: fade(28) }} />
    </AbsoluteFill>
  );
};

export const Tutorial: React.FC<{ timeline: Timeline }> = ({ timeline: t }) => {
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  return (
    <AbsoluteFill style={{ fontFamily: `'${t.brand.fontFamily}', Inter, 'Segoe UI', system-ui, sans-serif` }}>
      <Background t={t} />
      <Sequence from={0} durationInFrames={f(t.intro.duration)}><Intro t={t} /></Sequence>
      <Sequence from={0} durationInFrames={f(t.outro.start + 0.4)} layout="none"><Screen t={t} /></Sequence>
      {t.steps.filter((s) => s.title).map((s) => (
        <Sequence key={s.id} from={f(s.start)} durationInFrames={Math.max(1, f(s.end - s.start))} layout="none"><StepBadge t={t} step={s} /></Sequence>
      ))}
      {t.showCaptions && t.captions.map((c, i) => (
          <Sequence key={i} from={f(c.start)} durationInFrames={Math.max(1, f(c.end - c.start))} layout="none"><Caption t={t} text={c.text} dur={c.end - c.start} top={c.position === 'top'} /></Sequence>
        ))}
      <Sequence from={f(t.outro.start)} durationInFrames={f(t.outro.duration)}><Outro t={t} /></Sequence>
      {t.audio.src && <Audio src={staticFile(t.audio.src)} />}
    </AbsoluteFill>
  );
};
