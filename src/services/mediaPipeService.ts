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

export interface MediaPipeConfig {
  width: number;
  height: number;
  downsampleFactor: number; // 0.5 = half resolution, 0.25 = quarter resolution
  useGPU: boolean;
  modelComplexity: number; // 0 = light, 1 = full, 2 = heavy
  enableOptimizations: boolean;
}

export interface PerformanceMetrics {
  processingTime: number;
  fps: number;
  gpuAccelerated: boolean;
  downsampleFactor: number;
}

// MediaPipe landmark connections
export const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
];

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
  [0, 9], [9, 10], [10, 11], [11, 12], // Middle finger
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring finger
  [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
];

export const FACE_OVAL_CONNECTIONS = [
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389],
  [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
  [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
  [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162],
  [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10]
];

/**
 * Initialize MediaPipe Holistic with performance optimizations
 */
export async function initializeMediaPipe(
  onResultsCallback: (results: PoseResults) => void, 
  config: MediaPipeConfig = {
    width: 640,
    height: 480,
    downsampleFactor: 0.5, // Process at half resolution by default
    useGPU: true,
    modelComplexity: 0, // Use lightweight model by default
    enableOptimizations: true
  }
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

      // Determine optimal settings based on config and hardware
      const holisticOptions = await getOptimalMediaPipeSettings(config);
      await holistic.setOptions(holisticOptions);

      // Wrap callback to handle upsampling if needed
      const wrappedCallback = config.enableOptimizations 
        ? createUpsamplingCallback(onResultsCallback, config)
        : onResultsCallback;

      holistic.onResults(wrappedCallback);
      
      return { holistic, Camera, config };
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
    if (landmark.x !== undefined && landmark.y !== undefined &&
        (landmark.visibility === undefined || landmark.visibility > 0.5)) {
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
      
      if (startPoint.x !== undefined && startPoint.y !== undefined && 
          endPoint.x !== undefined && endPoint.y !== undefined &&
          (startPoint.visibility === undefined || startPoint.visibility > 0.5) &&
          (endPoint.visibility === undefined || endPoint.visibility > 0.5)) {
        ctx.beginPath();
        ctx.moveTo(
          startPoint.x * ctx.canvas.width,
          startPoint.y * ctx.canvas.height
        );
        ctx.lineTo(
          endPoint.x * ctx.canvas.width,
          endPoint.y * ctx.canvas.height
        );
        ctx.stroke();
      }
    }
  }
}

/**
 * Detect hardware acceleration capabilities
 */
export async function detectHardwareCapabilities(): Promise<{supportsGPU: boolean, supportsWASM: boolean}> {
  try {
    // Check for WebGL support (GPU acceleration)
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    const supportsGPU = !!gl && !!(gl as WebGLRenderingContext)?.getExtension('OES_texture_float');
    
    // Check for WebAssembly support
    const supportsWASM = typeof WebAssembly === 'object';
    
    console.log('Hardware capabilities:', { supportsGPU, supportsWASM });
    return { supportsGPU, supportsWASM };
  } catch (error) {
    console.warn('Error detecting hardware capabilities:', error);
    return { supportsGPU: false, supportsWASM: false };
  }
}

/**
 * Get optimal MediaPipe settings based on config and hardware
 */
export async function getOptimalMediaPipeSettings(config: MediaPipeConfig) {
  const hardware = await detectHardwareCapabilities();
  
  // Adjust settings based on hardware capabilities
  const useGPU = config.useGPU && hardware.supportsGPU;
  const modelComplexity = (hardware.supportsGPU ? config.modelComplexity : Math.min(config.modelComplexity, 0)) as 0 | 1 | 2;
  
  console.log(`MediaPipe settings: GPU=${useGPU}, Model Complexity=${modelComplexity}`);
  
  return {
    modelComplexity: modelComplexity,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    refineFaceLandmarks: modelComplexity > 0, // Only enable for higher complexity
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
    selfieMode: true,
    // GPU acceleration settings
    ...(useGPU && {
      runtime: 'mediapipe_gpu'
    })
  };
}

/**
 * Create canvas for downsampling
 */
export function createDownsampleCanvas(width: number, height: number, factor: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  downsampledWidth: number;
  downsampledHeight: number;
} {
  const canvas = document.createElement('canvas');
  const downsampledWidth = Math.round(width * factor);
  const downsampledHeight = Math.round(height * factor);
  
  canvas.width = downsampledWidth;
  canvas.height = downsampledHeight;
  
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  return { canvas, ctx, downsampledWidth, downsampledHeight };
}

/**
 * Create upsampling callback that scales landmarks back to original resolution
 */
export function createUpsamplingCallback(
  originalCallback: (results: PoseResults) => void,
  config: MediaPipeConfig
): (results: PoseResults) => void {
  const scaleFactor = 1 / config.downsampleFactor;
  
  return (results: PoseResults) => {
    // Scale landmarks back to original resolution
    // Note: MediaPipe returns normalized coordinates (0-1), so no scaling needed
    const upsampledResults: PoseResults = {
      ...results,
      poseLandmarks: results.poseLandmarks?.map(landmark => ({
        ...landmark,
        x: landmark.x, // Already normalized
        y: landmark.y,
        z: landmark.z
      })),
      leftHandLandmarks: results.leftHandLandmarks?.map(landmark => ({
        ...landmark,
        x: landmark.x,
        y: landmark.y,
        z: landmark.z
      })),
      rightHandLandmarks: results.rightHandLandmarks?.map(landmark => ({
        ...landmark,
        x: landmark.x,
        y: landmark.y,
        z: landmark.z
      })),
      faceLandmarks: results.faceLandmarks?.map(landmark => ({
        ...landmark,
        x: landmark.x,
        y: landmark.y,
        z: landmark.z
      }))
    };
    
    originalCallback(upsampledResults);
  };
}

/**
 * Create optimized MediaPipe camera instance with downsampling
 */
export function createOptimizedMediaPipeCamera(
  videoElement: HTMLVideoElement, 
  holistic: any, 
  config: MediaPipeConfig
) {
  return async function createCamera(Camera: any) {
    let downsampleCanvas: HTMLCanvasElement | null = null;
    let downsampleCtx: CanvasRenderingContext2D | null = null;
    let downsampledWidth: number;
    let downsampledHeight: number;
    
    // Create downsampling canvas if optimizations are enabled
    if (config.enableOptimizations && config.downsampleFactor < 1) {
      const downsampleSetup = createDownsampleCanvas(
        config.width, 
        config.height, 
        config.downsampleFactor
      );
      downsampleCanvas = downsampleSetup.canvas;
      downsampleCtx = downsampleSetup.ctx;
      downsampledWidth = downsampleSetup.downsampledWidth;
      downsampledHeight = downsampleSetup.downsampledHeight;
      
      console.log(`Downsampling enabled: ${config.width}x${config.height} -> ${downsampledWidth}x${downsampledHeight}`);
    }
    
    const camera = new Camera(videoElement, {
      onFrame: async () => {
        if (holistic && videoElement) {
          try {
            let imageToSend = videoElement;
            
            // Downsample if optimizations are enabled
            if (config.enableOptimizations && downsampleCanvas && downsampleCtx) {
              downsampleCtx.drawImage(
                videoElement, 
                0, 0, videoElement.videoWidth, videoElement.videoHeight,
                0, 0, downsampledWidth, downsampledHeight
              );
              imageToSend = downsampleCanvas as any; // Canvas can be sent to MediaPipe
            }
            
            await holistic.send({ image: imageToSend });
          } catch (error) {
            console.error('Error sending frame to MediaPipe:', error);
          }
        }
      },
      width: config.width,
      height: config.height
    });
    
    return camera;
  };
}

/**
 * Legacy MediaPipe camera function for backward compatibility
 */
export function createMediaPipeCamera(videoElement: any, holistic: any, width: any, height: any) {
  const config: MediaPipeConfig = {
    width,
    height,
    downsampleFactor: 1, // No downsampling for legacy
    useGPU: false,
    modelComplexity: 0,
    enableOptimizations: false
  };
  
  return createOptimizedMediaPipeCamera(videoElement, holistic, config);
}