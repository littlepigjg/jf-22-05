import {
  playOscillators,
  shouldPlayPocket,
  shouldPlayCollision,
  setCollisionPlaybackFn,
  isMuted,
  type PlaybackHandle,
} from './engine';

function playCollisionSound(velocity: number): void {
  const maxVel = 28;
  const normalized = Math.min(velocity / maxVel, 1);
  const volume = 0.08 + normalized * 0.45;

  playOscillators([
    {
      type: 'triangle',
      startFreq: 600 + normalized * 800,
      endFreq: 300,
      freqRampDuration: 0.03,
      startVolume: volume,
      volumeRampDuration: 0.04,
    },
    {
      type: 'square',
      startFreq: 1800 + normalized * 1200,
      endFreq: 600,
      freqRampDuration: 0.015,
      startVolume: volume * 0.3,
      volumeRampDuration: 0.02,
    },
  ]);
}

setCollisionPlaybackFn(playCollisionSound);

export function playCueHit(power: number): PlaybackHandle | null {
  if (isMuted()) return null;

  const volume = 0.15 + power * 0.65;

  return playOscillators([
    {
      type: 'square',
      startFreq: 280 + power * 120,
      endFreq: 80,
      freqRampDuration: 0.06,
      startVolume: volume,
      volumeRampDuration: 0.08,
    },
    {
      type: 'sawtooth',
      startFreq: 800 + power * 600,
      endFreq: 200,
      freqRampDuration: 0.04,
      startVolume: volume * 0.4,
      volumeRampDuration: 0.05,
    },
  ]);
}

export function playBallCollision(
  aId: number,
  bId: number,
  velocity: number,
): void {
  shouldPlayCollision(aId, bId, velocity);
}

export function playPocket(ballId: number): PlaybackHandle | null {
  if (isMuted()) return null;
  if (!shouldPlayPocket(ballId)) return null;

  return playOscillators([
    {
      type: 'sine',
      startFreq: 180,
      endFreq: 60,
      freqRampDuration: 0.2,
      startVolume: 0.5,
      volumeRampDuration: 0.25,
    },
    {
      type: 'sine',
      startFreq: 90,
      endFreq: 30,
      freqRampDuration: 0.3,
      startVolume: 0.35,
      volumeRampDuration: 0.3,
    },
  ]);
}

export { setMuted, toggleMute, isMuted, stopAll } from './engine';
