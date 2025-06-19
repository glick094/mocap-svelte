/**
 * Game Store
 * Manages game state, scores, and target information
 */
import { writable, derived } from 'svelte/store';

// Type definitions
export interface ScoreBreakdown {
  hand: number;
  head: number;
  knee: number;
}

export interface GameSettings {
  targetDuration: number;
  targetSize: number;
}

export type TargetType = 'hand' | 'head' | 'knee' | null;

// Game state stores
export const isGameActive = writable<boolean>(false);
export const gameScore = writable<number>(0);
export const currentTargetType = writable<TargetType>(null);
export const scoreBreakdown = writable<ScoreBreakdown>({ hand: 0, head: 0, knee: 0 });

// Game settings
export const gameSettings = writable<GameSettings>({
  targetDuration: 3000, // ms
  targetSize: 50 // pixels
});

// Derived stores
export const totalTargets = derived(
  scoreBreakdown,
  $breakdown => $breakdown.hand + $breakdown.head + $breakdown.knee
);

export const gameProgress = derived(
  [gameScore, totalTargets],
  ([$score, $total]) => $total > 0 ? ($score / $total) * 100 : 0
);

// Game actions
export function startGame() {
  isGameActive.set(true);
  gameScore.set(0);
  scoreBreakdown.set({ hand: 0, head: 0, knee: 0 });
  currentTargetType.set(null);
}

export function endGame() {
  isGameActive.set(false);
  currentTargetType.set(null);
}

export function updateScore(points: number) {
  gameScore.update(score => score + points);
}

export function updateTargetScore(targetType: keyof ScoreBreakdown) {
  scoreBreakdown.update(breakdown => ({
    ...breakdown,
    [targetType]: breakdown[targetType] + 1
  }));
}

export function setCurrentTarget(targetType: TargetType) {
  currentTargetType.set(targetType);
}

export function clearCurrentTarget() {
  currentTargetType.set(null);
}