export interface PlaybackHandle {
  stop: () => void;
}

type NodeGroup = {
  oscillators: OscillatorNode[];
  gains: GainNode[];
};

let audioCtx: AudioContext | null = null;

const activeNodes: Set<NodeGroup> = new Set();

let muted = false;

const recentCollisions = new Map<string, number>();
const recentPockets = new Map<number, number>();

const COLLISION_DEBOUNCE_MS = 30;
const POCKET_DEBOUNCE_MS = 50;

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
  if (muted) {
    stopAll();
  }
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

export function stopAll(): void {
  const ctx = audioCtx;
  const now = ctx ? ctx.currentTime : 0;
  for (const group of activeNodes) {
    for (let i = 0; i < group.gains.length; i++) {
      const gain = group.gains[i];
      const osc = group.oscillators[i];
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);
        osc?.stop(now + 0.015);
      } catch {
        try {
          osc?.stop();
        } catch {
          // ignore
        }
      }
    }
  }
  activeNodes.clear();
}

function register(group: NodeGroup): void {
  activeNodes.add(group);
  for (const osc of group.oscillators) {
    osc.onended = () => {
      activeNodes.delete(group);
    };
  }
}

export interface OscSpec {
  type: OscillatorType;
  startFreq: number;
  endFreq?: number;
  freqRampDuration?: number;
  startVolume: number;
  endVolume?: number;
  volumeRampDuration?: number;
}

export function playOscillators(specs: OscSpec[]): PlaybackHandle | null {
  if (muted) return null;

  const ctx = getCtx();
  const now = ctx.currentTime;

  const oscillators: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  let maxEndTime = now;

  for (const spec of specs) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.startFreq, now);

    if (spec.endFreq !== undefined && spec.freqRampDuration !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(spec.endFreq, 0.0001),
        now + spec.freqRampDuration,
      );
    }

    gain.gain.setValueAtTime(spec.startVolume, now);

    if (spec.endVolume !== undefined && spec.volumeRampDuration !== undefined) {
      gain.gain.exponentialRampToValueAtTime(
        Math.max(spec.endVolume, 0.0001),
        now + spec.volumeRampDuration,
      );
    } else if (spec.volumeRampDuration !== undefined) {
      gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.volumeRampDuration);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);

    const stopAt = spec.volumeRampDuration ?? spec.freqRampDuration ?? 0.1;
    const endTime = now + stopAt + 0.001;
    osc.start(now);
    osc.stop(endTime);
    if (endTime > maxEndTime) maxEndTime = endTime;

    oscillators.push(osc);
    gains.push(gain);
  }

  const group: NodeGroup = { oscillators, gains };
  register(group);

  return {
    stop: () => {
      const curNow = audioCtx?.currentTime ?? 0;
      for (let i = 0; i < gains.length; i++) {
        try {
          gains[i].gain.cancelScheduledValues(curNow);
          gains[i].gain.setValueAtTime(gains[i].gain.value, curNow);
          gains[i].gain.exponentialRampToValueAtTime(0.0001, curNow + 0.01);
          oscillators[i]?.stop(curNow + 0.015);
        } catch {
          try {
            oscillators[i]?.stop();
          } catch {
            // ignore
          }
        }
      }
      activeNodes.delete(group);
    },
  };
}

export function shouldPlayCollision(aId: number, bId: number): boolean {
  const key = aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
  const now = performance.now();
  const last = recentCollisions.get(key);
  if (last !== undefined && now - last < COLLISION_DEBOUNCE_MS) {
    return false;
  }
  recentCollisions.set(key, now);
  return true;
}

export function shouldPlayPocket(ballId: number): boolean {
  const now = performance.now();
  const last = recentPockets.get(ballId);
  if (last !== undefined && now - last < POCKET_DEBOUNCE_MS) {
    return false;
  }
  recentPockets.set(ballId, now);
  return true;
}

const CLEANUP_INTERVAL_MS = 2000;
let cleanupTimer: number | null = null;

export function startCleanup(): void {
  if (cleanupTimer !== null) return;
  cleanupTimer = window.setInterval(() => {
    const now = performance.now();
    for (const [key, ts] of recentCollisions) {
      if (now - ts > CLEANUP_INTERVAL_MS) recentCollisions.delete(key);
    }
    for (const [id, ts] of recentPockets) {
      if (now - ts > CLEANUP_INTERVAL_MS) recentPockets.delete(id);
    }
  }, CLEANUP_INTERVAL_MS);
}

export function stopCleanup(): void {
  if (cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

startCleanup();
