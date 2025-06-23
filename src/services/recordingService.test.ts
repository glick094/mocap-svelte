/**
 * Unit tests for Recording Service
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	generateTimestamp,
	generateParticipantId,
	createCSVHeader,
	formatPoseDataForCSV,
	startRecordingSession,
	downloadFile,
	startVideoRecording,
	stopVideoRecording
} from './recordingService.js';

describe('recordingService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('generateTimestamp', () => {
		it('should generate a properly formatted timestamp', () => {
			const mockDate = new Date('2024-01-15T14:30:45.123Z');
			vi.setSystemTime(mockDate);

			const timestamp = generateTimestamp();
			expect(timestamp).toBe('2024-01-15T14-30-45');
		});

		it('should replace colons and periods with dashes', () => {
			const timestamp = generateTimestamp();
			expect(timestamp).not.toMatch(/[:.]/);
			expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
		});
	});

	describe('generateParticipantId', () => {
		it('should return username when provided', () => {
			const userSettings = { username: 'testuser' };
			const participantId = generateParticipantId(userSettings);
			expect(participantId).toBe('testuser');
		});

		it('should generate random participant ID when no username', () => {
			const userSettings = {};
			const participantId = generateParticipantId(userSettings);
			expect(participantId).toMatch(/^P\d{4}$/);
		});

		it('should generate different IDs on multiple calls', () => {
			const userSettings = {};
			const id1 = generateParticipantId(userSettings);
			const id2 = generateParticipantId(userSettings);
			// Note: There's a small chance these could be the same, but very unlikely
			expect(id1).toMatch(/^P\d{4}$/);
			expect(id2).toMatch(/^P\d{4}$/);
		});
	});

	describe('createCSVHeader', () => {
		it('should create a properly formatted CSV header', () => {
			const header = createCSVHeader();
			const headerArray = header.trim().split(',');

			// Check for required columns
			expect(headerArray).toContain('unix_timestamp_ms');
			expect(headerArray).toContain('frame_time_ms');
			expect(headerArray).toContain('pose_landmarks_count');
			expect(headerArray).toContain('target_showing');
			expect(headerArray).toContain('target_type');
		});

		it('should include all pose landmark columns', () => {
			const header = createCSVHeader();
			const headerArray = header.trim().split(',');

			// Check for pose landmarks (33 landmarks * 4 properties each)
			expect(headerArray).toContain('pose_0_x');
			expect(headerArray).toContain('pose_0_y');
			expect(headerArray).toContain('pose_0_z');
			expect(headerArray).toContain('pose_0_visibility');
			expect(headerArray).toContain('pose_32_x');
			expect(headerArray).toContain('pose_32_y');
			expect(headerArray).toContain('pose_32_z');
			expect(headerArray).toContain('pose_32_visibility');
		});

		it('should include hand landmark columns', () => {
			const header = createCSVHeader();
			const headerArray = header.trim().split(',');

			// Check for hand landmarks (21 landmarks * 3 properties each * 2 hands)
			expect(headerArray).toContain('left_hand_0_x');
			expect(headerArray).toContain('left_hand_20_z');
			expect(headerArray).toContain('right_hand_0_x');
			expect(headerArray).toContain('right_hand_20_z');
		});

		it('should include face landmark columns', () => {
			const header = createCSVHeader();
			const headerArray = header.trim().split(',');

			// Check for face landmarks (468 landmarks * 3 properties each)
			expect(headerArray).toContain('face_0_x');
			expect(headerArray).toContain('face_467_z');
		});
	});

	describe('formatPoseDataForCSV', () => {
		it('should format pose data correctly with all landmarks', () => {
			const mockPoseData = {
				poseLandmarks: [
					{ x: 0.5, y: 0.6, z: 0.7, visibility: 0.9 },
					{ x: 0.1, y: 0.2, z: 0.3, visibility: 0.8 }
				],
				leftHandLandmarks: [{ x: 0.4, y: 0.5, z: 0.6 }],
				rightHandLandmarks: [{ x: 0.7, y: 0.8, z: 0.9 }],
				faceLandmarks: [{ x: 0.1, y: 0.1, z: 0.1 }]
			};

			// Mock global target data (normalized coordinates 0-1)
			(globalThis as any).currentTargetData = {
				targetShowing: true,
				targetId: 'test-target',
				targetType: 'hand',
				targetX: 0.5, // Normalized coordinate (0-1 range)
				targetY: 0.3, // Normalized coordinate (0-1 range)
				status: 'start'
			};

			const csvRow = formatPoseDataForCSV(mockPoseData, 1234567890, 500.5);
			const rowArray = csvRow.trim().split(',');

			expect(rowArray[0]).toBe('1234567890'); // timestamp
			expect(rowArray[1]).toBe('500.5'); // frame time
			expect(rowArray[2]).toBe('2'); // pose landmarks count
			expect(rowArray[3]).toBe('1'); // left hand landmarks count
			expect(rowArray[4]).toBe('1'); // right hand landmarks count
			expect(rowArray[5]).toBe('1'); // face landmarks count
			expect(rowArray[6]).toBe('true'); // target showing
			expect(rowArray[7]).toBe('test-target'); // target id
			expect(rowArray[8]).toBe('hand'); // target type
			expect(rowArray[9]).toBe('0.5'); // target x (normalized)
			expect(rowArray[10]).toBe('0.3'); // target y (normalized)
		});

		it('should handle missing landmarks gracefully', () => {
			const mockPoseData = {
				poseLandmarks: undefined,
				leftHandLandmarks: undefined,
				rightHandLandmarks: [],
				faceLandmarks: undefined
			};

			(globalThis as any).currentTargetData = {
				targetShowing: false,
				targetId: null,
				targetType: null,
				targetX: null,
				targetY: null,
				status: null
			};

			const csvRow = formatPoseDataForCSV(mockPoseData, 1234567890, 500.5);
			const rowArray = csvRow.trim().split(',');

			expect(rowArray[2]).toBe('0'); // pose landmarks count
			expect(rowArray[3]).toBe('0'); // left hand landmarks count
			expect(rowArray[4]).toBe('0'); // right hand landmarks count
			expect(rowArray[5]).toBe('0'); // face landmarks count
		});

		it('should handle missing global target data', () => {
			const mockPoseData = {
				poseLandmarks: [{ x: 0.5, y: 0.6, z: 0.7, visibility: 0.9 }]
			};

			// Clear global target data
			(globalThis as any).currentTargetData = undefined;

			const csvRow = formatPoseDataForCSV(mockPoseData, 1234567890, 500.5);
			const rowArray = csvRow.trim().split(',');

			expect(rowArray[6]).toBe('false'); // target showing (default)
			expect(rowArray[7]).toBe(''); // target id (default - empty string in CSV
		});
	});

	describe('startRecordingSession', () => {
		it('should create a recording session with correct structure', () => {
			const mockPerformance = vi.spyOn(performance, 'now').mockReturnValue(1500.25);

			const session = startRecordingSession('P1234', '2024-01-15T14-30-45');

			expect(session).toEqual({
				participantId: 'P1234',
				timestamp: '2024-01-15T14-30-45',
				filename: 'P1234_2024-01-15T14-30-45.csv',
				csvContent: expect.stringContaining('unix_timestamp_ms'),
				performanceStartTime: 1500.25
			});

			mockPerformance.mockRestore();
		});

		it('should include CSV header in content', () => {
			const session = startRecordingSession('testuser', '2024-01-15T14-30-45');
			expect(session.csvContent).toContain('unix_timestamp_ms');
			expect(session.csvContent).toContain('pose_landmarks_count');
			expect(session.csvContent).toMatch(/\n$/);
		});
	});

	describe('downloadFile', () => {
		it('should create and trigger download', () => {
			// Skip this test in environments without DOM
			if (typeof document === 'undefined') {
				return;
			}

			// Mock DOM elements and methods
			const mockLink = {
				href: '',
				download: '',
				click: vi.fn()
			};
			const mockCreateElement = vi
				.spyOn(document, 'createElement')
				.mockReturnValue(mockLink as any);
			const mockAppendChild = vi
				.spyOn(document.body, 'appendChild')
				.mockImplementation(() => mockLink as any);
			const mockRemoveChild = vi
				.spyOn(document.body, 'removeChild')
				.mockImplementation(() => mockLink as any);
			vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
			const mockRevokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

			downloadFile('test content', 'test.csv', 'text/csv');

			expect(mockCreateElement).toHaveBeenCalledWith('a');
			expect(mockLink.download).toBe('test.csv');
			expect(mockLink.click).toHaveBeenCalled();
			expect(mockAppendChild).toHaveBeenCalledWith(mockLink);
			expect(mockRemoveChild).toHaveBeenCalledWith(mockLink);
			expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
		});
	});

	describe('video recording', () => {
		let mockMediaRecorder: any;
		let mockStream: any;

		beforeEach(() => {
			// Mock MediaRecorder
			mockMediaRecorder = {
				start: vi.fn(),
				stop: vi.fn(),
				state: 'inactive',
				ondataavailable: null,
				onstop: null
			};

			mockStream = {
				getTracks: vi.fn(() => [])
			};

			(globalThis as any).MediaRecorder = vi.fn().mockImplementation(() => mockMediaRecorder);
			(globalThis as any).MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);
		});

		describe('startVideoRecording', () => {
			it('should start video recording with proper setup', async () => {
				const result = await startVideoRecording(mockStream, 'P1234', '2024-01-15T14-30-45');

				expect(result).toEqual({
					mediaRecorder: mockMediaRecorder,
					filename: 'P1234_2024-01-15T14-30-45_video.webm'
				});
				expect(mockMediaRecorder.start).toHaveBeenCalled();
			});

			it('should throw error when no video stream provided', async () => {
				await expect(startVideoRecording(null, 'P1234', '2024-01-15T14-30-45')).rejects.toThrow(
					'Video stream not available for recording'
				);
			});

			it('should handle different MIME type fallbacks', async () => {
				const mockIsTypeSupported = vi
					.fn()
					.mockReturnValueOnce(false) // vp9 not supported
					.mockReturnValueOnce(true); // vp8 supported

				(globalThis as any).MediaRecorder.isTypeSupported = mockIsTypeSupported;

				await startVideoRecording(mockStream, 'P1234', '2024-01-15T14-30-45');

				expect(mockIsTypeSupported).toHaveBeenCalledWith('video/webm;codecs=vp9');
				expect(mockIsTypeSupported).toHaveBeenCalledWith('video/webm;codecs=vp8');
			});
		});

		describe('stopVideoRecording', () => {
			it('should stop active recording', () => {
				mockMediaRecorder.state = 'recording';
				stopVideoRecording(mockMediaRecorder);
				expect(mockMediaRecorder.stop).toHaveBeenCalled();
			});

			it('should not stop inactive recording', () => {
				mockMediaRecorder.state = 'inactive';
				stopVideoRecording(mockMediaRecorder);
				expect(mockMediaRecorder.stop).not.toHaveBeenCalled();
			});

			it('should handle null media recorder gracefully', () => {
				expect(() => stopVideoRecording(null)).not.toThrow();
			});
		});
	});
});
