/**
 * MediaPipe Service
 * Handles MediaPipe initialization, pose tracking, and landmark processing
 */

// Type definitions
export interface Landmark {
	x: number;
	y: number;
	z: number;
	visibility?: number;
}

export interface PoseResults {
	poseLandmarks?: Landmark[];
	leftHandLandmarks?: Landmark[];
	rightHandLandmarks?: Landmark[];
	faceLandmarks?: Landmark[];
	timestamp?: number;
}

// MediaPipe landmark connections
export const POSE_CONNECTIONS = [
	[11, 12],
	[11, 13],
	[13, 15],
	[15, 17],
	[15, 19],
	[15, 21],
	[17, 19],
	[12, 14],
	[14, 16],
	[16, 18],
	[16, 20],
	[16, 22],
	[18, 20],
	[11, 23],
	[12, 24],
	[23, 24],
	[23, 25],
	[24, 26],
	[25, 27],
	[26, 28],
	[27, 29],
	[28, 30],
	[29, 31],
	[30, 32],
	[27, 31],
	[28, 32]
];

export const HAND_CONNECTIONS = [
	[0, 1],
	[1, 2],
	[2, 3],
	[3, 4], // Thumb
	[0, 5],
	[5, 6],
	[6, 7],
	[7, 8], // Index finger
	[0, 9],
	[9, 10],
	[10, 11],
	[11, 12], // Middle finger
	[0, 13],
	[13, 14],
	[14, 15],
	[15, 16], // Ring finger
	[0, 17],
	[17, 18],
	[18, 19],
	[19, 20] // Pinky
];

export const FACE_OVAL_CONNECTIONS = [
	[10, 338],
	[338, 297],
	[297, 332],
	[332, 284],
	[284, 251],
	[251, 389],
	[389, 356],
	[356, 454],
	[454, 323],
	[323, 361],
	[361, 288],
	[288, 397],
	[397, 365],
	[365, 379],
	[379, 378],
	[378, 400],
	[400, 377],
	[377, 152],
	[152, 148],
	[148, 176],
	[176, 149],
	[149, 150],
	[150, 136],
	[136, 172],
	[172, 58],
	[58, 132],
	[132, 93],
	[93, 234],
	[234, 127],
	[127, 162],
	[162, 21],
	[21, 54],
	[54, 103],
	[103, 67],
	[67, 109],
	[109, 10]
];

/**
 * Initialize MediaPipe Holistic with CDN fallbacks
 */
export async function initializeMediaPipe(
	onResultsCallback: (results: PoseResults) => void,
	width: number = 640,
	height: number = 480
) {
	const cdnOptions = [
		'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629',
		'https://cdn.jsdelivr.net/npm/@mediapipe/holistic',
		'https://unpkg.com/@mediapipe/holistic@0.5.1675471629',
		'https://unpkg.com/@mediapipe/holistic'
	];

	for (const cdnUrl of cdnOptions) {
		try {
			console.log(`Trying MediaPipe initialization with CDN: ${cdnUrl}`);

			const { Holistic } = await import('@mediapipe/holistic');
			const { Camera } = await import('@mediapipe/camera_utils');

			const holistic = new Holistic({
				locateFile: (file) => `${cdnUrl}/${file}`
			});

			await holistic.setOptions({
				modelComplexity: 0,
				smoothLandmarks: true,
				enableSegmentation: false,
				smoothSegmentation: false,
				refineFaceLandmarks: false,
				minDetectionConfidence: 0.6,
				minTrackingConfidence: 0.5
			});

			holistic.onResults(onResultsCallback);

			return { holistic, Camera };
		} catch (error) {
			console.warn(`Failed to initialize with ${cdnUrl}:`, error);
			if (cdnUrl === cdnOptions[cdnOptions.length - 1]) {
				throw new Error('All MediaPipe CDN options failed');
			}
		}
	}
}

/**
 * Draw landmarks on canvas
 */
export function drawLandmarks(
	ctx: CanvasRenderingContext2D,
	landmarks: Landmark[],
	color: string = '#00FF00',
	radius: number = 4
) {
	if (!landmarks || !ctx) return;

	ctx.fillStyle = color;
	for (const landmark of landmarks) {
		if (
			landmark.x !== undefined &&
			landmark.y !== undefined &&
			(landmark.visibility === undefined || landmark.visibility > 0.5)
		) {
			ctx.beginPath();
			ctx.arc(
				landmark.x * ctx.canvas.width,
				landmark.y * ctx.canvas.height,
				radius,
				0,
				2 * Math.PI
			);
			ctx.fill();
		}
	}
}

/**
 * Draw connections between landmarks
 */
export function drawConnections(
	ctx: CanvasRenderingContext2D,
	landmarks: Landmark[],
	connections: number[][],
	color: string = '#00FF00',
	lineWidth: number = 2
) {
	if (!landmarks || !connections || !ctx) return;

	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;

	for (const [start, end] of connections) {
		if (start < landmarks.length && end < landmarks.length) {
			const startPoint = landmarks[start];
			const endPoint = landmarks[end];

			if (
				startPoint.x !== undefined &&
				startPoint.y !== undefined &&
				endPoint.x !== undefined &&
				endPoint.y !== undefined &&
				(startPoint.visibility === undefined || startPoint.visibility > 0.5) &&
				(endPoint.visibility === undefined || endPoint.visibility > 0.5)
			) {
				ctx.beginPath();
				ctx.moveTo(startPoint.x * ctx.canvas.width, startPoint.y * ctx.canvas.height);
				ctx.lineTo(endPoint.x * ctx.canvas.width, endPoint.y * ctx.canvas.height);
				ctx.stroke();
			}
		}
	}
}

/**
 * Create MediaPipe camera instance
 */
export function createMediaPipeCamera(videoElement, holistic, width, height) {
	return async function createCamera(Camera) {
		const camera = new Camera(videoElement, {
			onFrame: async () => {
				if (holistic && videoElement) {
					try {
						await holistic.send({ image: videoElement });
					} catch (error) {
						console.error('Error sending frame to MediaPipe:', error);
					}
				}
			},
			width: width,
			height: height
		});

		return camera;
	};
}
