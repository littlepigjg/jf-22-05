let audioCtx: AudioContext | null = null;

let muted = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(v: boolean): void {
  muted = v;
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}

export function playCueHit(power: number): void {
  if (muted) return;
  const ctx = getCtx();
  const now = ctx.currentTime;

  const volume = 0.15 + power * 0.65;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(280 + power * 120, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);

  const noise = ctx.createOscillator();
  noise.type = 'sawtooth';
  noise.frequency.setValueAtTime(800 + power * 600, now);
  noise.frequency.exponentialRampToValueAtTime(200, now + 0.04);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.4, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  noise.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.05);
}

export function playBallCollision(velocity: number): void {
  if (muted) return;
  const ctx = getCtx();
  const now = ctx.currentTime;

  const maxVel = 28;
  const normalized = Math.min(velocity / maxVel, 1);
  const volume = 0.08 + normalized * 0.45;

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(600 + normalized * 800, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.04);

  const click = ctx.createOscillator();
  click.type = 'square';
  click.frequency.setValueAtTime(1800 + normalized * 1200, now);
  click.frequency.exponentialRampToValueAtTime(600, now + 0.015);

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(volume * 0.3, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

  click.connect(clickGain);
  clickGain.connect(ctx.destination);
  click.start(now);
  click.stop(now + 0.02);
}

export function playPocket(): void {
  if (muted) return;
  const ctx = getCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(90, now);
  sub.frequency.exponentialRampToValueAtTime(30, now + 0.3);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.35, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  sub.connect(subGain);
  subGain.connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.3);
}
