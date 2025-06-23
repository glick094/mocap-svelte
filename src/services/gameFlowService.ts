/**
 * Game Flow Service
 * Manages the automatic progression through all game modes with recording
 */

import { GAME_MODES, type GameMode } from './gameService.js';

export interface GameFlowConfig {
	games: GameMode[];
	delayBetweenGames: number; // milliseconds
	autoStartRecording: boolean;
}

export interface GameFlowState {
	currentGameIndex: number;
	currentGame: GameMode | null;
	phase: 'waiting' | 'playing' | 'delay' | 'completed';
	isActive: boolean;
	delayStartTime: number | null;
	delayRemaining: number;
}

export class GameFlowService {
	private state: GameFlowState;
	private config: GameFlowConfig;
	private callbacks: {
		onGameStart?: (gameMode: GameMode, gameIndex: number) => void;
		onGameEnd?: (gameMode: GameMode, gameIndex: number) => void;
		onDelayStart?: (nextGame: GameMode, delayTime: number) => void;
		onDelayUpdate?: (remaining: number) => void;
		onFlowComplete?: () => void;
		onRecordingStart?: (gameMode: GameMode, filename: string) => void;
		onRecordingStop?: (gameMode: GameMode, filename: string) => void;
	};

	constructor(
		config: GameFlowConfig = {
			games: [
				GAME_MODES.HIPS_SWAY,
				GAME_MODES.HANDS_FIXED,
				GAME_MODES.HEAD_FIXED,
				GAME_MODES.RANDOM
			],
			delayBetweenGames: 5000, // 5 seconds
			autoStartRecording: true
		}
	) {
		this.config = config;
		this.callbacks = {};
		this.state = {
			currentGameIndex: -1,
			currentGame: null,
			phase: 'waiting',
			isActive: false,
			delayStartTime: null,
			delayRemaining: 0
		};
	}

	// Configuration methods
	public updateConfig(newConfig: Partial<GameFlowConfig>): void {
		this.config = { ...this.config, ...newConfig };
	}

	public setCallbacks(callbacks: Partial<typeof this.callbacks>): void {
		this.callbacks = { ...this.callbacks, ...callbacks };
	}

	// State getters
	public getState(): GameFlowState {
		return { ...this.state };
	}

	public getCurrentGame(): GameMode | null {
		return this.state.currentGame;
	}

	public isActive(): boolean {
		return this.state.isActive;
	}

	public getProgress(): { current: number; total: number; percentage: number } {
		const current = Math.max(0, this.state.currentGameIndex);
		const total = this.config.games.length;
		const percentage = total > 0 ? (current / total) * 100 : 0;
		return { current, total, percentage };
	}

	// Flow control methods
	public startFlow(): void {
		console.log('Starting game flow with config:', this.config);
		this.state.isActive = true;
		this.state.currentGameIndex = -1;
		this.state.phase = 'waiting';
		// Start with initial delay
		this.startDelay();
	}

	public stopFlow(): void {
		console.log('Stopping game flow');
		this.state.isActive = false;
		this.state.phase = 'waiting';
		this.state.currentGame = null;
		this.state.delayStartTime = null;
		this.state.delayRemaining = 0;

		if (this.callbacks.onRecordingStop && this.state.currentGame) {
			this.callbacks.onRecordingStop(
				this.state.currentGame,
				this.getGameDataFilename(this.state.currentGame)
			);
		}
	}

	public onGameCompleted(): void {
		if (!this.state.isActive || this.state.phase !== 'playing') return;

		console.log(`Game completed: ${this.state.currentGame}`);

		// Stop recording for current game
		if (this.callbacks.onRecordingStop && this.state.currentGame) {
			this.callbacks.onRecordingStop(
				this.state.currentGame,
				this.getGameDataFilename(this.state.currentGame)
			);
		}

		// Notify game end
		if (this.callbacks.onGameEnd && this.state.currentGame) {
			this.callbacks.onGameEnd(this.state.currentGame, this.state.currentGameIndex);
		}

		// Check if there are more games
		if (this.state.currentGameIndex < this.config.games.length - 1) {
			this.startDelay();
		} else {
			this.completeFlow();
		}
	}

	// For random mode timeout
	public onRandomGameTimeout(): void {
		if (this.state.currentGame === GAME_MODES.RANDOM) {
			this.onGameCompleted();
		}
	}

	public update(): void {
		if (!this.state.isActive) return;

		if (this.state.phase === 'delay' && this.state.delayStartTime) {
			const elapsed = Date.now() - this.state.delayStartTime;
			this.state.delayRemaining = Math.max(0, this.config.delayBetweenGames - elapsed);

			if (this.callbacks.onDelayUpdate) {
				this.callbacks.onDelayUpdate(this.state.delayRemaining);
			}

			if (this.state.delayRemaining <= 0) {
				this.startNextGame();
			}
		}
	}

	// Private methods
	private startNextGame(): void {
		this.state.currentGameIndex++;

		if (this.state.currentGameIndex >= this.config.games.length) {
			this.completeFlow();
			return;
		}

		this.state.currentGame = this.config.games[this.state.currentGameIndex];
		this.state.phase = 'playing';

		console.log(
			`Starting game ${this.state.currentGameIndex + 1}/${this.config.games.length}: ${this.state.currentGame}`
		);

		// Start recording for new game
		if (
			this.config.autoStartRecording &&
			this.callbacks.onRecordingStart &&
			this.state.currentGame
		) {
			this.callbacks.onRecordingStart(
				this.state.currentGame,
				this.getGameDataFilename(this.state.currentGame)
			);
		}

		// Notify game start
		if (this.callbacks.onGameStart && this.state.currentGame) {
			this.callbacks.onGameStart(this.state.currentGame, this.state.currentGameIndex);
		}
	}

	private startDelay(): void {
		this.state.phase = 'delay';
		this.state.delayStartTime = Date.now();
		this.state.delayRemaining = this.config.delayBetweenGames;

		const nextGameIndex = this.state.currentGameIndex + 1;
		const nextGame =
			nextGameIndex < this.config.games.length ? this.config.games[nextGameIndex] : null;

		if (nextGame) {
			console.log(
				`Starting delay: ${this.config.delayBetweenGames / 1000}s until next game (${nextGame})`
			);

			if (this.callbacks.onDelayStart) {
				this.callbacks.onDelayStart(nextGame, this.config.delayBetweenGames);
			}
		} else {
			// This shouldn't happen, but just in case
			this.completeFlow();
		}
	}

	private completeFlow(): void {
		console.log('Game flow completed');
		this.state.phase = 'completed';
		this.state.isActive = false;
		this.state.currentGame = null;

		if (this.callbacks.onFlowComplete) {
			this.callbacks.onFlowComplete();
		}
	}

	private getGameDataFilename(gameMode: GameMode): string {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const gameName = gameMode.replace('-', '_');
		return `game_data_${gameName}_${timestamp}`;
	}

	// Utility methods
	public getRemainingGames(): GameMode[] {
		if (this.state.currentGameIndex < 0) {
			return [...this.config.games];
		}
		return this.config.games.slice(this.state.currentGameIndex + 1);
	}

	public getCompletedGames(): GameMode[] {
		if (this.state.currentGameIndex < 0) {
			return [];
		}
		return this.config.games.slice(0, this.state.currentGameIndex + 1);
	}

	public formatDelayTime(ms: number): string {
		const seconds = Math.ceil(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		if (minutes > 0) {
			return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
		}
		return `${remainingSeconds}s`;
	}

	// Game mode display names
	public getGameDisplayName(gameMode: GameMode): string {
		switch (gameMode) {
			case GAME_MODES.HIPS_SWAY:
				// return 'Hip Sway';
				return 'Hips';
			case GAME_MODES.HANDS_FIXED:
				// return 'Hands Figure-8';
				return 'Hands';
			case GAME_MODES.HEAD_FIXED:
				// return 'Head Circle';
				return 'Head';
			case GAME_MODES.RANDOM:
				// return 'Random Targets';
				return 'Random';
			default:
				return gameMode;
		}
	}
}
