/**
 * Unit tests for Game Store
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	isGameActive,
	gameScore,
	currentTargetType,
	scoreBreakdown,
	gameSettings,
	totalTargets,
	gameProgress,
	startGame,
	endGame,
	updateScore,
	updateTargetScore,
	setCurrentTarget,
	clearCurrentTarget,
	type ScoreBreakdown,
	type GameSettings,
	type TargetType
} from './gameStore.js';

describe('gameStore', () => {
	beforeEach(() => {
		// Reset all stores to initial state
		startGame();
		endGame();
	});

	describe('basic stores', () => {
		it('should initialize with correct default values', () => {
			expect(get(isGameActive)).toBe(false);
			expect(get(gameScore)).toBe(0);
			expect(get(currentTargetType)).toBe(null);
			expect(get(scoreBreakdown)).toEqual({ hand: 0, head: 0, knee: 0 });
		});

		it('should update isGameActive store', () => {
			isGameActive.set(true);
			expect(get(isGameActive)).toBe(true);

			isGameActive.set(false);
			expect(get(isGameActive)).toBe(false);
		});

		it('should update gameScore store', () => {
			gameScore.set(150);
			expect(get(gameScore)).toBe(150);

			gameScore.update((score) => score + 50);
			expect(get(gameScore)).toBe(200);
		});

		it('should update currentTargetType store', () => {
			currentTargetType.set('hand');
			expect(get(currentTargetType)).toBe('hand');

			currentTargetType.set('head');
			expect(get(currentTargetType)).toBe('head');

			currentTargetType.set('knee');
			expect(get(currentTargetType)).toBe('knee');

			currentTargetType.set(null);
			expect(get(currentTargetType)).toBe(null);
		});

		it('should update scoreBreakdown store', () => {
			const newBreakdown: ScoreBreakdown = { hand: 5, head: 3, knee: 2 };
			scoreBreakdown.set(newBreakdown);
			expect(get(scoreBreakdown)).toEqual(newBreakdown);
		});
	});

	describe('gameSettings store', () => {
		it('should have correct default settings', () => {
			const settings = get(gameSettings);

			expect(settings.targetDuration).toBe(3000);
			expect(settings.targetSize).toBe(50);
			expect(settings.targetColors).toEqual({
				hand: '#00ff88',
				head: '#ff6b6b',
				knee: '#4ecdc4'
			});
		});

		it('should update game settings', () => {
			const newSettings: GameSettings = {
				targetDuration: 5000,
				targetSize: 75,
				targetColors: {
					hand: '#ff0000',
					head: '#00ff00',
					knee: '#0000ff'
				}
			};

			gameSettings.set(newSettings);
			expect(get(gameSettings)).toEqual(newSettings);
		});

		it('should update partial settings', () => {
			gameSettings.update((settings) => ({
				...settings,
				targetDuration: 4000
			}));

			const updated = get(gameSettings);
			expect(updated.targetDuration).toBe(4000);
			expect(updated.targetSize).toBe(50); // Should remain unchanged
		});
	});

	describe('derived stores', () => {
		describe('totalTargets', () => {
			it('should calculate total targets correctly', () => {
				expect(get(totalTargets)).toBe(0);

				scoreBreakdown.set({ hand: 5, head: 3, knee: 2 });
				expect(get(totalTargets)).toBe(10);

				scoreBreakdown.set({ hand: 0, head: 0, knee: 0 });
				expect(get(totalTargets)).toBe(0);
			});

			it('should update when scoreBreakdown changes', () => {
				const initialTotal = get(totalTargets);
				expect(initialTotal).toBe(0);

				scoreBreakdown.update((breakdown) => ({
					...breakdown,
					hand: breakdown.hand + 1
				}));

				expect(get(totalTargets)).toBe(1);
			});
		});

		describe('gameProgress', () => {
			it('should return 0 when no targets hit', () => {
				gameScore.set(0);
				scoreBreakdown.set({ hand: 0, head: 0, knee: 0 });
				expect(get(gameProgress)).toBe(0);
			});

			it('should return 0 when score is 0 but targets were shown', () => {
				gameScore.set(0);
				scoreBreakdown.set({ hand: 5, head: 3, knee: 2 }); // 10 total targets
				expect(get(gameProgress)).toBe(0);
			});

			it('should calculate correct percentage', () => {
				gameScore.set(7);
				scoreBreakdown.set({ hand: 5, head: 3, knee: 2 }); // 10 total targets
				expect(get(gameProgress)).toBe(70);

				gameScore.set(5);
				scoreBreakdown.set({ hand: 10, head: 0, knee: 0 }); // 10 total targets
				expect(get(gameProgress)).toBe(50);
			});

			it('should handle perfect score', () => {
				gameScore.set(10);
				scoreBreakdown.set({ hand: 5, head: 3, knee: 2 }); // 10 total targets
				expect(get(gameProgress)).toBe(100);
			});

			it('should handle score higher than total targets', () => {
				// This shouldn't happen in normal gameplay, but test edge case
				gameScore.set(15);
				scoreBreakdown.set({ hand: 5, head: 3, knee: 2 }); // 10 total targets
				expect(get(gameProgress)).toBe(150);
			});
		});
	});

	describe('game actions', () => {
		describe('startGame', () => {
			it('should reset all game state', () => {
				// Set some existing state
				isGameActive.set(false);
				gameScore.set(100);
				scoreBreakdown.set({ hand: 5, head: 3, knee: 2 });
				currentTargetType.set('hand');

				startGame();

				expect(get(isGameActive)).toBe(true);
				expect(get(gameScore)).toBe(0);
				expect(get(scoreBreakdown)).toEqual({ hand: 0, head: 0, knee: 0 });
				expect(get(currentTargetType)).toBe(null);
			});
		});

		describe('endGame', () => {
			it('should stop the game and clear current target', () => {
				// Start a game first
				startGame();
				setCurrentTarget('hand');

				expect(get(isGameActive)).toBe(true);
				expect(get(currentTargetType)).toBe('hand');

				endGame();

				expect(get(isGameActive)).toBe(false);
				expect(get(currentTargetType)).toBe(null);
				// Score and breakdown should remain unchanged
			});

			it('should preserve score and breakdown when ending game', () => {
				startGame();
				updateScore(50);
				updateTargetScore('hand');

				const scoreBeforeEnd = get(gameScore);
				const breakdownBeforeEnd = get(scoreBreakdown);

				endGame();

				expect(get(gameScore)).toBe(scoreBeforeEnd);
				expect(get(scoreBreakdown)).toEqual(breakdownBeforeEnd);
			});
		});

		describe('updateScore', () => {
			it('should add points to current score', () => {
				gameScore.set(0);
				updateScore(10);
				expect(get(gameScore)).toBe(10);

				updateScore(5);
				expect(get(gameScore)).toBe(15);
			});

			it('should handle negative points', () => {
				gameScore.set(20);
				updateScore(-5);
				expect(get(gameScore)).toBe(15);
			});

			it('should handle zero points', () => {
				gameScore.set(10);
				updateScore(0);
				expect(get(gameScore)).toBe(10);
			});
		});

		describe('updateTargetScore', () => {
			it('should increment hand score', () => {
				updateTargetScore('hand');
				expect(get(scoreBreakdown).hand).toBe(1);

				updateTargetScore('hand');
				expect(get(scoreBreakdown).hand).toBe(2);
			});

			it('should increment head score', () => {
				updateTargetScore('head');
				expect(get(scoreBreakdown).head).toBe(1);

				updateTargetScore('head');
				expect(get(scoreBreakdown).head).toBe(2);
			});

			it('should increment knee score', () => {
				updateTargetScore('knee');
				expect(get(scoreBreakdown).knee).toBe(1);

				updateTargetScore('knee');
				expect(get(scoreBreakdown).knee).toBe(2);
			});

			it('should not affect other scores when updating one type', () => {
				updateTargetScore('hand');
				updateTargetScore('head');

				const breakdown = get(scoreBreakdown);
				expect(breakdown.hand).toBe(1);
				expect(breakdown.head).toBe(1);
				expect(breakdown.knee).toBe(0);
			});
		});

		describe('setCurrentTarget', () => {
			it('should set valid target types', () => {
				setCurrentTarget('hand');
				expect(get(currentTargetType)).toBe('hand');

				setCurrentTarget('head');
				expect(get(currentTargetType)).toBe('head');

				setCurrentTarget('knee');
				expect(get(currentTargetType)).toBe('knee');
			});

			it('should set null target', () => {
				setCurrentTarget('hand');
				setCurrentTarget(null);
				expect(get(currentTargetType)).toBe(null);
			});
		});

		describe('clearCurrentTarget', () => {
			it('should clear current target', () => {
				setCurrentTarget('hand');
				expect(get(currentTargetType)).toBe('hand');

				clearCurrentTarget();
				expect(get(currentTargetType)).toBe(null);
			});

			it('should work when target is already null', () => {
				clearCurrentTarget();
				expect(get(currentTargetType)).toBe(null);
			});
		});
	});

	describe('integration scenarios', () => {
		it('should handle complete game workflow', () => {
			// Start game
			startGame();
			expect(get(isGameActive)).toBe(true);
			expect(get(gameScore)).toBe(0);

			// Show and hit some targets
			setCurrentTarget('hand');
			updateScore(10);
			updateTargetScore('hand');
			clearCurrentTarget();

			setCurrentTarget('head');
			updateScore(15);
			updateTargetScore('head');
			clearCurrentTarget();

			// Check intermediate state
			expect(get(gameScore)).toBe(25);
			expect(get(scoreBreakdown)).toEqual({ hand: 1, head: 1, knee: 0 });
			expect(get(totalTargets)).toBe(2);
			expect(get(gameProgress)).toBe(100); // 25 points / 25 max points

			// End game
			endGame();
			expect(get(isGameActive)).toBe(false);
			expect(get(currentTargetType)).toBe(null);
			// Scores should persist
			expect(get(gameScore)).toBe(25);
			expect(get(scoreBreakdown)).toEqual({ hand: 1, head: 1, knee: 0 });
		});

		it('should handle missed targets (targets shown but not hit)', () => {
			startGame();

			// Show targets but don't score
			setCurrentTarget('hand');
			updateTargetScore('hand'); // Target was shown
			clearCurrentTarget();

			setCurrentTarget('knee');
			updateTargetScore('knee'); // Target was shown
			clearCurrentTarget();

			// No points scored, but targets were shown
			expect(get(gameScore)).toBe(0);
			expect(get(totalTargets)).toBe(2);
			expect(get(gameProgress)).toBe(0); // 0% success rate
		});
	});
});
