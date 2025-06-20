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

export interface HipSwayTextPrompts {
  centering: {
    main: string;
    subCentered: string;
    subNotCentered: string;
  };
  targeting: {
    progress: (total: number, left: number, right: number) => string;
    instruction: (side: string) => string;
  };
  completed: {
    main: string;
    score: (score: number, total: number) => string;
  };
}

export interface GameModeTexts {
  displayNames: {
    [key: string]: string;
  };
  descriptions: {
    [key: string]: string;
  };
}

export interface GameSettings {
  targetDuration: number;
  targetSize: number;
  hipSwayGame: {
    targetsPerSide: number;
    centeringTolerance: number; // Pixels from center line
    centeringTimeRequired: number; // ms to hold center position
  };
  hipSwayTextPrompts: HipSwayTextPrompts;
  gameModeTexts: GameModeTexts;
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
  targetSize: 50, // pixels
  hipSwayGame: {
    targetsPerSide: 5,
    centeringTolerance: 50, // pixels
    centeringTimeRequired: 1000 // 1 second
  },
  hipSwayTextPrompts: {
    centering: {
      main: 'Position yourself at the center line',
      subCentered: 'Hold position to continue...',
      subNotCentered: 'Center your hips on the white line'
    },
    targeting: {
      progress: (total: number, left: number, right: number) => 
        `Progress: ${total}/10 (L:${left} R:${right})`,
      instruction: (side: string) => 
        `Move your hips to the ${side.toUpperCase()} rectangle`
    },
    completed: {
      main: 'Hip Sway Game Complete!',
      score: (score: number, total: number) => 
        `Final Score: ${score}/${total}`
    }
  },
  gameModeTexts: {
    displayNames: {
      'hips-sway': 'HIPS',
      'hands-fixed': 'HANDS', 
      'head-fixed': 'HEAD',
      'random': 'RANDOM'
    },
    descriptions: {
      'hips-sway': 'Sway your hips left and right to hit the target regions',
      'hands-fixed': 'Hit targets with either of your hands',
      'head-fixed': 'Hit targets by moving your head', 
      'random': 'Hit targets with your hands, head, and knees'
    }
  }
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