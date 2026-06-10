export interface PlaybackHandle {
  stop: () => void;
}

type NodeGroup = {
  oscillators: OscillatorNode[];
  gains: GainNode[];
  endedCount: number;
  total: number;
};

let audioCtx: AudioContext | null = null;

const activeNodes: Set<NodeGroup> = new Set();

let muted = false;

const COLLISION_PAIR_DEBOUNCE_MS = 30;
const COLLISION_GLOBAL_WINDOW_MS = 40;
const COLLISION_MAX_PER_WINDOW = 2;
const POCKET_DEBOUNCE_MS = 200;
const STOP_FADE_MS = 0.002;

const recentCollisions = new Map<string, number>();
const recentPockets = new Map<number, number>();

let collisionBuffer: Array<{ velocity: number; aId: number; bId: number }> = [];
let collisionTimerId: number | null = null;

let playCollisionFn: ((velocity: number) => void) | null = null;

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
  if (!ctx) return;
  const now = ctx.currentTime;

  for (const group of activeNodes) {
    for (let i = 0; i < group.gains.length; i++) {
      const gain = group.gains[i];
      const osc = group.oscillators[i];
      if (!osc) continue;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + STOP_FADE_MS);
        osc.stop(now + STOP_FADE_MS + 0.001);
      } catch {
        try {
          osc.stop();
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
      group.endedCount++;
      if (group.endedCount >= group.total) {
        activeNodes.delete(group);
      }
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

    oscillators.push(osc);
    gains.push(gain);
  }

  const group: NodeGroup = {
    oscillators,
    gains,
    endedCount: 0,
    total: oscillators.length,
  };
  register(group);

  return {
    stop: () => {
      const curNow = audioCtx?.currentTime ?? 0;
      for (let i = 0; i < gains.length; i++) {
        try {
          gains[i].gain.cancelScheduledValues(curNow);
          gains[i].gain.setValueAtTime(gains[i].gain.value, curNow);
          gains[i].gain.exponentialRampToValueAtTime(0.0001, curNow + STOP_FADE_MS);
          oscillators[i]?.stop(curNow + STOP_FADE_MS + 0.001);
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

export function shouldPlayCollision(aId: number, bId: number, velocity: number): boolean {
  if (muted) return false;

  const key = aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
  const now = performance.now();
  const last = recentCollisions.get(key);
  if (last !== undefined && now - last < COLLISION_PAIR_DEBOUNCE_MS) {
    return false;
  }
  recentCollisions.set(key, now);

  collisionBuffer.push({ velocity, aId, bId });

  if (collisionTimerId === null) {
    collisionTimerId = window.setTimeout(() => {
      flushCollisions();
    }, COLLISION_GLOBAL_WINDOW_MS);
  }

  return false;
}

function flushCollisions(): void {
  collisionTimerId = null;

  if (collisionBuffer.length === 0 || muted) {
    collisionBuffer = [];
    return;
  }

  collisionBuffer.sort((a, b) => b.velocity - a.velocity);

  const toPlay = collisionBuffer.slice(0, COLLISION_MAX_PER_WINDOW);
  collisionBuffer = [];

  if (playCollisionFn) {
    for (const col of toPlay) {
      playCollisionFn(col.velocity);
    }
  }
}

export function setCollisionPlaybackFn(fn: (velocity: number) => void): void {
  playCollisionFn = fn;
}

export function shouldPlayPocket(ballId: number): boolean {
  if (muted) return false;

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
  if (collisionTimerId !== null) {
    clearTimeout(collisionTimerId);
    collisionTimerId = null;
  }
}

startCleanup();
