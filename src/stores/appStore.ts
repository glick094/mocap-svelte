/**
 * Application Store
 * Manages global application state, settings, and UI state
 */
import { writable, derived } from 'svelte/store';

// UI State
export const showSettings = writable(false);
export const isWebcamActive = writable(true);

// User Settings
export const userSettings = writable({
	username: '',
	theme: 'dark',
	quality: 'high',
	enableAudio: true,
	fps: 15,
	enableSmoothing: true,
	filterWindowSize: 5
});

// Webcam/Canvas Settings
export const webcamSettings = writable({
	width: 300,
	height: 225
});

export const canvasSettings = writable({
	width: typeof window !== 'undefined' ? window.innerWidth : 1920,
	height: typeof window !== 'undefined' ? window.innerHeight - 80 : 1000
});

// Participant Information
export const participantInfo = writable({
	participantId: '',
	age: null,
	height: null
});

// Recording State
export const isRecording = writable(false);
export const recordingSession = writable(null);

// Pose Data
export const currentPoseData = writable(null);
export const poseHistory = writable([]);

// Smoothing Settings
export const smoothingSettings = writable({
	enableSmoothing: true,
	filterWindowSize: 5,
	polynomialOrder: 2
});

// Derived stores
export const isSettingsOpen = derived(showSettings, ($show) => $show);

export const recordingStatus = derived(
	[isRecording, recordingSession],
	([$recording, $session]) => ({
		active: $recording,
		filename: $session?.filename || null,
		duration: $session ? Date.now() - $session.startTime : 0
	})
);

// Actions
export function toggleSettings() {
	showSettings.update((show) => !show);
}

export function toggleWebcam() {
	isWebcamActive.update((active) => !active);
}

export function updateUserSettings(newSettings) {
	userSettings.update((settings) => ({ ...settings, ...newSettings }));
}

export function updateParticipantInfo(info) {
	participantInfo.update((current) => ({ ...current, ...info }));
}

export function startRecording(session) {
	isRecording.set(true);
	recordingSession.set(session);
}

export function stopRecording() {
	isRecording.set(false);
	recordingSession.set(null);
}

export function updatePoseData(data) {
	currentPoseData.set(data);
	poseHistory.update((history) => {
		const newHistory = [...history, data];
		return newHistory.slice(-60); // Keep last 60 frames
	});
}
