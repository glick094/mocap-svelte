/**
 * Unit tests for App Store
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	isRecording,
	isWebcamActive,
	showSettings,
	userSettings,
	participantInfo,
	uiState,
	resetAppState,
	updateUserSettings,
	updateParticipantInfo,
	toggleRecording,
	toggleWebcam,
	toggleSettings,
	type UserSettings,
	type ParticipantInfo,
	type UIState
} from './appStore.js';

describe('appStore', () => {
	beforeEach(() => {
		// Reset all stores to initial state
		resetAppState();
	});

	describe('basic stores', () => {
		it('should initialize with correct default values', () => {
			expect(get(isRecording)).toBe(false);
			expect(get(isWebcamActive)).toBe(true);
			expect(get(showSettings)).toBe(false);
		});

		it('should update isRecording store', () => {
			isRecording.set(true);
			expect(get(isRecording)).toBe(true);

			isRecording.set(false);
			expect(get(isRecording)).toBe(false);
		});

		it('should update isWebcamActive store', () => {
			isWebcamActive.set(false);
			expect(get(isWebcamActive)).toBe(false);

			isWebcamActive.set(true);
			expect(get(isWebcamActive)).toBe(true);
		});

		it('should update showSettings store', () => {
			showSettings.set(true);
			expect(get(showSettings)).toBe(true);

			showSettings.set(false);
			expect(get(showSettings)).toBe(false);
		});
	});

	describe('userSettings store', () => {
		it('should have correct default settings', () => {
			const settings = get(userSettings);

			expect(settings.username).toBe('');
			expect(settings.theme).toBe('dark');
			expect(settings.quality).toBe('high');
			expect(settings.enableAudio).toBe(true);
			expect(settings.fps).toBe(15);
			expect(settings.enableSmoothing).toBe(true);
			expect(settings.filterWindowSize).toBe(5);
		});

		it('should update user settings', () => {
			const newSettings: UserSettings = {
				username: 'testuser',
				theme: 'light',
				quality: 'medium',
				enableAudio: false,
				fps: 30,
				enableSmoothing: false,
				filterWindowSize: 7
			};

			userSettings.set(newSettings);
			expect(get(userSettings)).toEqual(newSettings);
		});

		it('should update partial settings', () => {
			userSettings.update((settings) => ({
				...settings,
				username: 'newuser',
				fps: 24
			}));

			const updated = get(userSettings);
			expect(updated.username).toBe('newuser');
			expect(updated.fps).toBe(24);
			expect(updated.theme).toBe('dark'); // Should remain default
		});
	});

	describe('participantInfo store', () => {
		it('should have correct default participant info', () => {
			const info = get(participantInfo);

			expect(info.id).toBe('');
			expect(info.age).toBeNull();
			expect(info.gender).toBe('');
			expect(info.condition).toBe('');
			expect(info.sessionDate).toBe('');
			expect(info.notes).toBe('');
		});

		it('should update participant info', () => {
			const newInfo: ParticipantInfo = {
				id: 'P001',
				age: 25,
				gender: 'female',
				condition: 'control',
				sessionDate: '2024-01-15',
				notes: 'First session'
			};

			participantInfo.set(newInfo);
			expect(get(participantInfo)).toEqual(newInfo);
		});

		it('should handle null age correctly', () => {
			participantInfo.update((info) => ({
				...info,
				id: 'P002',
				age: null
			}));

			const updated = get(participantInfo);
			expect(updated.id).toBe('P002');
			expect(updated.age).toBeNull();
		});
	});

	describe('uiState store', () => {
		it('should have correct default UI state', () => {
			const state = get(uiState);

			expect(state.isLoading).toBe(false);
			expect(state.errorMessage).toBe('');
			expect(state.currentView).toBe('main');
			expect(state.sidebarCollapsed).toBe(false);
			expect(state.fullscreen).toBe(false);
		});

		it('should update UI state', () => {
			const newState: UIState = {
				isLoading: true,
				errorMessage: 'Test error',
				currentView: 'settings',
				sidebarCollapsed: true,
				fullscreen: true
			};

			uiState.set(newState);
			expect(get(uiState)).toEqual(newState);
		});

		it('should update partial UI state', () => {
			uiState.update((state) => ({
				...state,
				isLoading: true,
				errorMessage: 'Loading data...'
			}));

			const updated = get(uiState);
			expect(updated.isLoading).toBe(true);
			expect(updated.errorMessage).toBe('Loading data...');
			expect(updated.currentView).toBe('main'); // Should remain default
		});
	});

	describe('store actions', () => {
		describe('resetAppState', () => {
			it('should reset all stores to default values', () => {
				// Set some non-default values
				isRecording.set(true);
				isWebcamActive.set(false);
				showSettings.set(true);
				userSettings.update((s) => ({ ...s, username: 'test' }));
				participantInfo.update((p) => ({ ...p, id: 'P001' }));
				uiState.update((u) => ({ ...u, isLoading: true }));

				resetAppState();

				expect(get(isRecording)).toBe(false);
				expect(get(isWebcamActive)).toBe(true);
				expect(get(showSettings)).toBe(false);
				expect(get(userSettings).username).toBe('');
				expect(get(participantInfo).id).toBe('');
				expect(get(uiState).isLoading).toBe(false);
			});
		});

		describe('updateUserSettings', () => {
			it('should merge new settings with existing ones', () => {
				const partialSettings = {
					username: 'newuser',
					fps: 30
				};

				updateUserSettings(partialSettings);

				const settings = get(userSettings);
				expect(settings.username).toBe('newuser');
				expect(settings.fps).toBe(30);
				expect(settings.theme).toBe('dark'); // Should remain default
				expect(settings.enableAudio).toBe(true); // Should remain default
			});

			it('should handle empty updates', () => {
				const originalSettings = get(userSettings);
				updateUserSettings({});
				expect(get(userSettings)).toEqual(originalSettings);
			});
		});

		describe('updateParticipantInfo', () => {
			it('should merge new info with existing info', () => {
				const partialInfo = {
					id: 'P001',
					age: 25
				};

				updateParticipantInfo(partialInfo);

				const info = get(participantInfo);
				expect(info.id).toBe('P001');
				expect(info.age).toBe(25);
				expect(info.gender).toBe(''); // Should remain default
				expect(info.condition).toBe(''); // Should remain default
			});

			it('should handle null values correctly', () => {
				updateParticipantInfo({ age: null });
				expect(get(participantInfo).age).toBeNull();
			});
		});

		describe('toggleRecording', () => {
			it('should toggle recording state from false to true', () => {
				expect(get(isRecording)).toBe(false);
				toggleRecording();
				expect(get(isRecording)).toBe(true);
			});

			it('should toggle recording state from true to false', () => {
				isRecording.set(true);
				toggleRecording();
				expect(get(isRecording)).toBe(false);
			});
		});

		describe('toggleWebcam', () => {
			it('should toggle webcam state from true to false', () => {
				expect(get(isWebcamActive)).toBe(true);
				toggleWebcam();
				expect(get(isWebcamActive)).toBe(false);
			});

			it('should toggle webcam state from false to true', () => {
				isWebcamActive.set(false);
				toggleWebcam();
				expect(get(isWebcamActive)).toBe(true);
			});
		});

		describe('toggleSettings', () => {
			it('should toggle settings visibility from false to true', () => {
				expect(get(showSettings)).toBe(false);
				toggleSettings();
				expect(get(showSettings)).toBe(true);
			});

			it('should toggle settings visibility from true to false', () => {
				showSettings.set(true);
				toggleSettings();
				expect(get(showSettings)).toBe(false);
			});
		});
	});

	describe('integration scenarios', () => {
		it('should handle app initialization workflow', () => {
			// Simulate app startup
			resetAppState();

			// User opens settings
			toggleSettings();
			expect(get(showSettings)).toBe(true);

			// User updates settings
			updateUserSettings({
				username: 'researcher',
				fps: 24,
				enableSmoothing: false
			});

			const settings = get(userSettings);
			expect(settings.username).toBe('researcher');
			expect(settings.fps).toBe(24);
			expect(settings.enableSmoothing).toBe(false);

			// User adds participant info
			updateParticipantInfo({
				id: 'P001',
				age: 25,
				condition: 'experimental'
			});

			const info = get(participantInfo);
			expect(info.id).toBe('P001');
			expect(info.age).toBe(25);
			expect(info.condition).toBe('experimental');

			// User closes settings
			toggleSettings();
			expect(get(showSettings)).toBe(false);
		});

		it('should handle recording workflow', () => {
			// Start with webcam active
			expect(get(isWebcamActive)).toBe(true);
			expect(get(isRecording)).toBe(false);

			// Start recording
			toggleRecording();
			expect(get(isRecording)).toBe(true);

			// Stop recording
			toggleRecording();
			expect(get(isRecording)).toBe(false);
		});

		it('should handle error states in UI', () => {
			uiState.update((state) => ({
				...state,
				isLoading: true,
				errorMessage: ''
			}));

			expect(get(uiState).isLoading).toBe(true);
			expect(get(uiState).errorMessage).toBe('');

			// Simulate error
			uiState.update((state) => ({
				...state,
				isLoading: false,
				errorMessage: 'Camera initialization failed'
			}));

			const state = get(uiState);
			expect(state.isLoading).toBe(false);
			expect(state.errorMessage).toBe('Camera initialization failed');
		});

		it('should handle view transitions', () => {
			// Start on main view
			expect(get(uiState).currentView).toBe('main');

			// Navigate to settings
			uiState.update((state) => ({
				...state,
				currentView: 'settings'
			}));

			expect(get(uiState).currentView).toBe('settings');

			// Navigate back to main
			uiState.update((state) => ({
				...state,
				currentView: 'main'
			}));

			expect(get(uiState).currentView).toBe('main');
		});
	});
});
