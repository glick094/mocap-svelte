<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import type { PoseResults, MediaPipeConfig } from '../services/mediaPipeService.js';
  import { initializeMediaPipe as initializeOptimizedMediaPipe, createOptimizedMediaPipeCamera } from '../services/mediaPipeService.js';
  import type { GameMode } from '../services/gameService.js';
  import { GameService, GAME_MODES } from '../services/gameService.js';
  import type { GameFlowState } from '../services/gameFlowService.js';
  import { poseColors, gameColors, uiColors } from '../stores/themeStore.js';

  // Component props
  export let width = 1920;
  export let height = 1080;
  export let gameActive = false;
  export let gameMode: GameMode = GAME_MODES.RANDOM;
  export let showPoseOverlay = true; // Control pose visibility
  export let gameFlowState: GameFlowState | null = null; // Game flow state for delay countdown
  export let isCountdownActive = false; // Manual mode countdown state
  export let countdownRemaining = 0; // Manual mode countdown time remaining
  export let isDataCollectionMode = true; // Data collection vs practice mode
  export let participantInfo: { participantId: string; age: number | null; height: number | null } = {
    participantId: '',
    age: null,
    height: null
  };

  // Event dispatcher
  const dispatch = createEventDispatcher<{
    poseUpdate: PoseResults;
    streamReady: MediaStream;
    gameStarted: { score: number; scoreBreakdown: any };
    scoreUpdate: { score: number; targetType: string; scoreBreakdown: any; modeProgress?: any };
    gameEnded: { finalScore: number; scoreBreakdown: any };
    targetChanged: { targetType: string };
    targetDataUpdate: any;
    qrCodeDetected: string;
    participantIdChange: string;
  }>();

  // Canvas and video elements
  let videoElement: HTMLVideoElement;
  let overlayCanvas: HTMLCanvasElement;
  let overlayCtx: CanvasRenderingContext2D;
  let videoStream: MediaStream | null = null;
  
  // Video scaling properties
  let videoAspectRatio = 16/9;
  let displayWidth = width;
  let displayHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  // MediaPipe
  let holistic: any = null;
  let camera: any = null;
  let isMediaPipeLoaded = false;
  let mediaPipeConfig: MediaPipeConfig;
  
  // Performance tracking
  let processingStartTime = 0;

  // Game state
  let gameService: GameService | null = null;
  let currentPoseData: PoseResults | null = null;
  let gameScore = 0;
  let scoreBreakdown = { hand: 0, head: 0, knee: 0 };

  // Performance monitoring
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 0;
  let avgGameLogicTime = 0;
  let gameLogicSamples: number[] = [];
  
  // Frame skipping for performance
  let frameSkipCounter = 0;

  // Hip sway animation state
  let lastHipHitTime = 0;
  let fadeOpacity = 0.7; // Base opacity for active regions

  // Reactive theme variables
  $: currentPoseColors = $poseColors;
  $: currentGameColors = $gameColors;
  $: currentUIColors = $uiColors;

  onMount(async () => {
    await initializeWebcam();
    await initializeMediaPipe();
    initializeGame();
    startRenderLoop();
  });

  async function initializeWebcam() {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });

      if (videoElement) {
        videoElement.srcObject = videoStream;
        
        // Wait for video metadata to calculate proper scaling
        videoElement.addEventListener('loadedmetadata', () => {
          calculateVideoScaling();
        });
        
        videoElement.play();
        
        // Dispatch stream ready event
        dispatch('streamReady', videoStream);
      }
    } catch (error) {
      console.error('Error accessing webcam:', error);
    }
  }

  function calculateVideoScaling() {
    if (!videoElement) return;
    
    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;
    videoAspectRatio = videoWidth / videoHeight;
    
    const containerAspectRatio = width / height;
    
    if (videoAspectRatio > containerAspectRatio) {
      // Video is wider - fit to width
      displayWidth = width;
      displayHeight = width / videoAspectRatio;
      offsetX = 0;
      offsetY = (height - displayHeight) / 2;
    } else {
      // Video is taller - fit to height
      displayWidth = height * videoAspectRatio;
      displayHeight = height;
      offsetX = (width - displayWidth) / 2;
      offsetY = 0;
    }
  }

  async function initializeMediaPipe() {
    try {
      // Create optimized MediaPipe configuration
      mediaPipeConfig = {
        width: width,
        height: height,
        downsampleFactor: 0.3, // Aggressive downsampling for CPU systems (was 0.5)
        useGPU: false, // Disable GPU for CPU-only systems to avoid overhead
        modelComplexity: 0, // Lightest model
        enableOptimizations: true
      };
      
      // Additional performance settings stored separately
      const performanceSettings = {
        frameSkipping: 2, // Process every 2nd frame for 2x speed boost
        reducedTracking: true, // Reduce tracking quality for performance
        disableSegmentation: true, // Disable segmentation completely
        minDetectionConfidence: 0.7, // Higher threshold = fewer false detections = faster
        minTrackingConfidence: 0.3 // Lower threshold = less re-detection = faster
      };
      
      console.log('Initializing optimized MediaPipe with config:', mediaPipeConfig);
      
      // Use the optimized MediaPipe initialization
      const mediaPipeResult = await initializeOptimizedMediaPipe(onPoseResults, mediaPipeConfig);
      
      if (mediaPipeResult) {
        holistic = mediaPipeResult.holistic;
        const { Camera } = mediaPipeResult;
        
        // Initialize optimized camera
        if (videoElement) {
          const createCameraFn = createOptimizedMediaPipeCamera(videoElement, holistic, mediaPipeConfig);
          camera = await createCameraFn(Camera);
          
          camera.start();
          isMediaPipeLoaded = true;
          
          console.log('MediaPipe initialization completed with optimizations');
        }
      }
    } catch (error) {
      console.error('Error initializing optimized MediaPipe:', error);
      
      // Fallback to basic MediaPipe configuration
      try {
        console.log('Falling back to basic MediaPipe configuration');
        await initializeBasicMediaPipe();
      } catch (fallbackError) {
        console.error('Fallback MediaPipe initialization also failed:', fallbackError);
      }
    }
  }
  
  async function initializeBasicMediaPipe() {
    // Dynamic import to avoid SSR issues
    const mediaPipeModule = await import('@mediapipe/holistic');
    const cameraModule = await import('@mediapipe/camera_utils');

    const { Holistic } = mediaPipeModule;
    const { Camera } = cameraModule;

    // Initialize basic Holistic with offline-first model loading
    const { getMediaPipeLocateFile } = await import('../services/offlineModelService.js');
    const locateFile = await getMediaPipeLocateFile();
    
    holistic = new Holistic({ locateFile });

    holistic.setOptions({
      modelComplexity: mediaPipeConfig?.modelComplexity || 0,
      smoothLandmarks: false, // Disable smoothing for better performance
      enableSegmentation: false, // Always disable segmentation for performance
      smoothSegmentation: false,
      minDetectionConfidence: 0.7, // Higher threshold = fewer false detections
      minTrackingConfidence: 0.3, // Lower threshold = less re-detection
      selfieMode: true
    });

    holistic.onResults(onPoseResults);

    // Initialize basic camera
    if (videoElement) {
      camera = new Camera(videoElement, {
        onFrame: async () => {
          if (holistic && videoElement) {
            // Implement frame skipping for performance (process every 2nd frame)
            frameSkipCounter++;
            
            if (frameSkipCounter % 2 === 0) {
              await holistic.send({ image: videoElement });
            }
          }
        },
        width: width,
        height: height
      });

      camera.start();
      isMediaPipeLoaded = true;
    }
  }

  function initializeGame() {
    gameService = new GameService(width, height, gameMode);
  }

  function onPoseResults(results: PoseResults) {
    const mediaPipeEndTime = performance.now();
    const mediaPipeInferenceTime = processingStartTime > 0 ? mediaPipeEndTime - processingStartTime : 0;
    
    currentPoseData = results;
    frameCount++;
    
    // Start timing game logic
    const gameLogicStartTime = performance.now();
    
    // Calculate FPS and processing time
    const now = performance.now();
    
    if (now - lastFpsTime >= 1000) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      frameCount = 0;
      lastFpsTime = now;
      
      // Calculate average game logic time
      avgGameLogicTime = gameLogicSamples.length > 0 
        ? gameLogicSamples.reduce((a, b) => a + b, 0) / gameLogicSamples.length 
        : 0;
      
      // Enhanced performance logging (commented out for production)
      // console.log(`🔍 Performance Breakdown (OPTIMIZED CPU MODE):
      //   📊 FPS: ${currentFps} (Target: 15+ for CPU, 30+ for GPU)
      //   🧠 MediaPipe Inference: ${mediaPipeInferenceTime.toFixed(1)}ms
      //   🎯 Game Logic: ${avgGameLogicTime.toFixed(1)}ms
      //   ⚙️  Model Complexity: ${mediaPipeConfig?.modelComplexity || 0} (0=fastest, 2=most accurate)
      //   📉 Downsampling: ${mediaPipeConfig?.downsampleFactor || 1.0}x (lower = faster)
      //   ⏭️  Frame Skipping: Every 2nd frame (2x speed boost)
      //   🎮 Game Active: ${gameActive}
      //   💾 GPU Enabled: ${mediaPipeConfig?.useGPU || false}
      //   🚫 Smoothing: Disabled
      //   🎯 Detection Confidence: 0.7 (higher = faster)
      //   
      //   💡 Bottleneck Analysis:
      //   ${mediaPipeInferenceTime > 60 ? '⚠️  MediaPipe inference still slow (>60ms)' : '✅ MediaPipe inference optimized'}
      //   ${avgGameLogicTime > 10 ? '⚠️  Game logic is slow (>10ms)' : '✅ Game logic OK'}
      //   ${currentFps < 10 ? '🔴 FPS critically low' : currentFps < 15 ? '🟡 FPS could be better' : '🟢 FPS good for CPU'}`);
    }
    
    processingStartTime = now; // Mark start of next processing cycle

    // Dispatch pose update
    dispatch('poseUpdate', results);

    // Handle game logic if game is active
    if (gameActive && gameService) {
      const collision = gameService.checkCollisions(results);
      const gameLogicTime = performance.now() - gameLogicStartTime;
      
      // Collect game logic timing samples
      gameLogicSamples.push(gameLogicTime);
      if (gameLogicSamples.length > 10) gameLogicSamples.shift(); // Keep last 10 samples
      if (collision.hit) {
        gameScore = gameService.getGameScore();
        scoreBreakdown = gameService.getScoreBreakdown();
        
        // Track hip collision for fade effect
        if (gameMode === GAME_MODES.HIPS_SWAY) {
          lastHipHitTime = Date.now();
        }
        
        dispatch('scoreUpdate', {
          score: gameScore,
          targetType: collision.hitType || '',
          scoreBreakdown,
          modeProgress: collision.modeProgress
        });
      }

      // Update target data
      const targetData = gameService.getCurrentTargetData();
      dispatch('targetDataUpdate', targetData);
      
      // Check if game is completed
      if (gameService.isGameComplete()) {
        console.log('Game completed, dispatching gameEnded event');
        dispatch('gameEnded', { finalScore: gameScore, scoreBreakdown });
      }
    }
  }

  function startRenderLoop() {
    function render() {
      if (overlayCanvas && overlayCtx && currentPoseData) {
        drawOverlay();
      }
      requestAnimationFrame(render);
    }
    render();
  }

  function drawOverlay() {
    if (!overlayCanvas || !overlayCtx || !currentPoseData) return;

    // Clear canvas
    overlayCtx.clearRect(0, 0, width, height);
    overlayCtx.save();

    // Draw pose landmarks (body only, no face)
    drawPoseLandmarks();
    
    // Draw hand landmarks
    drawHandLandmarks();
    
    // Draw face landmarks (from face model)
    drawFaceLandmarks();

    // Draw delay visuals or game elements
    if ((gameFlowState && gameFlowState.phase === 'delay') || isCountdownActive) {
      drawDelayVisuals();
    } else if (gameActive && gameService) {
      drawGameElements();
      drawGameInstructions();
    }

    overlayCtx.restore();

    // Draw UI elements
    drawUI();
  }

  function drawPoseLandmarks() {
    if (!currentPoseData?.poseLandmarks || !overlayCtx) return;

    const landmarks = currentPoseData.poseLandmarks;
    overlayCtx.globalAlpha = showPoseOverlay ? 1.0 : 0.0;
    overlayCtx.fillStyle = $poseColors.torso;
    overlayCtx.strokeStyle = $poseColors.torso;
    overlayCtx.lineWidth = 2;

    // Draw pose connections (body only, excluding face landmarks 0-10)
    const connections = [
      [11, 12], [12, 24], [24, 23], [23, 11], // Torso
      [11, 13], [13, 15], [12, 14], [14, 16], // Arms
      [23, 25], [25, 27], [24, 26], [26, 28], // Legs
      [15, 17], [15, 19], [15, 21], // Left hand connections
      [16, 18], [16, 20], [16, 22], // Right hand connections
      [25, 29], [25, 31], [27, 29], [27, 31], // Left foot connections  
      [26, 30], [26, 32], [28, 30], [28, 32]  // Right foot connections
    ];

    connections.forEach(([start, end]) => {
      const startPoint = landmarks[start];
      const endPoint = landmarks[end];
      if (startPoint && endPoint) {
        // Convert normalized coordinates to canvas coordinates
        const startX = offsetX + startPoint.x * displayWidth;
        const startY = offsetY + startPoint.y * displayHeight;
        const endX = offsetX + endPoint.x * displayWidth;
        const endY = offsetY + endPoint.y * displayHeight;
        
        overlayCtx.beginPath();
        overlayCtx.moveTo(startX, startY);
        overlayCtx.lineTo(endX, endY);
        overlayCtx.stroke();
      }
    });

    // Draw landmark points (body only, skip face landmarks 0-10)
    landmarks.forEach((landmark, index) => {
      if (landmark && index > 10) { // Skip face landmarks (0-10)
        // Convert normalized coordinates to canvas coordinates
        const x = offsetX + landmark.x * displayWidth;
        const y = offsetY + landmark.y * displayHeight;
        
        overlayCtx.beginPath();
        overlayCtx.arc(x, y, 3, 0, 2 * Math.PI);
        overlayCtx.fill();
      }
    });
    
    overlayCtx.globalAlpha = 1.0; // Reset alpha
  }

  function drawHandLandmarks() {
    if (!overlayCtx) return;
    
    overlayCtx.globalAlpha = showPoseOverlay ? 1.0 : 0.0;

    // Draw left hand
    if (currentPoseData?.leftHandLandmarks) {
      const color = gameMode === GAME_MODES.RANDOM ? $gameColors.hand : $poseColors.leftHand;
      drawHand(currentPoseData.leftHandLandmarks, color);
    }

    // Draw right hand
    if (currentPoseData?.rightHandLandmarks) {
      const color = gameMode === GAME_MODES.RANDOM ? $gameColors.hand : $poseColors.rightHand;
      drawHand(currentPoseData.rightHandLandmarks, color);
    }
    
    overlayCtx.globalAlpha = 1.0; // Reset alpha
  }

  function drawHand(landmarks: any[], color: string) {
    if (!overlayCtx) return;

    overlayCtx.fillStyle = color;
    overlayCtx.strokeStyle = color;
    overlayCtx.lineWidth = 2;

    // Hand connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17] // Palm
    ];

    connections.forEach(([start, end]) => {
      const startPoint = landmarks[start];
      const endPoint = landmarks[end];
      if (startPoint && endPoint) {
        // Convert normalized coordinates to canvas coordinates
        const startX = offsetX + startPoint.x * displayWidth;
        const startY = offsetY + startPoint.y * displayHeight;
        const endX = offsetX + endPoint.x * displayWidth;
        const endY = offsetY + endPoint.y * displayHeight;
        
        overlayCtx.beginPath();
        overlayCtx.moveTo(startX, startY);
        overlayCtx.lineTo(endX, endY);
        overlayCtx.stroke();
      }
    });

    // Draw hand points
    landmarks.forEach((landmark) => {
      if (landmark) {
        // Convert normalized coordinates to canvas coordinates
        const x = offsetX + landmark.x * displayWidth;
        const y = offsetY + landmark.y * displayHeight;
        
        overlayCtx.beginPath();
        overlayCtx.arc(x, y, 3, 0, 2 * Math.PI);
        overlayCtx.fill();
      }
    });
  }

  function drawFaceLandmarks() {
    if (!currentPoseData?.faceLandmarks || !overlayCtx) return;

    const landmarks = currentPoseData.faceLandmarks;
    overlayCtx.globalAlpha = showPoseOverlay ? 1.0 : 0.0;
    
    // Key facial feature landmarks (matching ThreeJSCanvas implementation)
    const facialFeatures = {
      // Face outline/contour
      faceContour: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
      
      // Left eyebrow
      leftEyebrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 70],
      
      // Right eyebrow  
      rightEyebrow: [296, 334, 293, 300, 276, 283, 282, 295, 285, 336, 296],
      
      // Left eye
      leftEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
      
      // Right eye
      rightEye: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
      
      // Nose
      nose: [1, 2, 5, 4, 6, 168, 8, 9, 10, 151, 195, 197, 51, 48, 115, 131, 134, 102, 49, 220, 281, 360, 279],
      
      // Mouth outer boundary
      mouthOuter: [324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
      
      // Mouth inner opening
      mouthInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 324]
    };
    
    // Colors and sizes for each feature
    const faceColor = $poseColors.face;
    const featureColors: { [key: string]: string } = {
      faceContour: faceColor,
      leftEyebrow: faceColor,
      rightEyebrow: faceColor, 
      leftEye: faceColor,
      rightEye: faceColor,
      nose: faceColor,
      mouthOuter: faceColor,
      mouthInner: faceColor
    };
    
    const featureSizes: { [key: string]: number } = {
      faceContour: 2,
      leftEyebrow: 3,
      rightEyebrow: 3,
      leftEye: 3,
      rightEye: 3,
      nose: 2,
      mouthOuter: 3,
      mouthInner: 2
    };
    
    // Draw landmarks for each feature
    Object.entries(facialFeatures).forEach(([featureName, indices]) => {
      overlayCtx.fillStyle = featureColors[featureName];
      const pointSize = featureSizes[featureName];
      
      indices.forEach((index) => {
        if (index < landmarks.length) {
          const landmark = landmarks[index];
          // Convert normalized coordinates to canvas coordinates
          const x = offsetX + landmark.x * displayWidth;
          const y = offsetY + landmark.y * displayHeight;
          
          overlayCtx.beginPath();
          overlayCtx.arc(x, y, pointSize, 0, 2 * Math.PI);
          overlayCtx.fill();
        }
      });
    });
    
    // Draw connections for key features
    drawFaceConnections(landmarks, facialFeatures);
    
    overlayCtx.globalAlpha = 1.0; // Reset alpha
  }

  function drawFaceConnections(landmarks: any[], facialFeatures: any) {
    if (!overlayCtx) return;
    
    overlayCtx.globalAlpha = showPoseOverlay ? 1.0 : 0.0;
    
    // Define connections for key facial features
    const connections = {
      leftEyebrow: facialFeatures.leftEyebrow.map((_: any, i: number, arr: any[]) => 
        i < arr.length - 1 ? [arr[i], arr[i + 1]] : null
      ).filter(Boolean),
      
      rightEyebrow: facialFeatures.rightEyebrow.map((_: any, i: number, arr: any[]) => 
        i < arr.length - 1 ? [arr[i], arr[i + 1]] : null
      ).filter(Boolean),
      
      leftEye: [...facialFeatures.leftEye.map((_: any, i: number, arr: any[]) => 
        [arr[i], arr[(i + 1) % arr.length]]
      )],
      
      rightEye: [...facialFeatures.rightEye.map((_: any, i: number, arr: any[]) => 
        [arr[i], arr[(i + 1) % arr.length]]
      )],
      
      // Connect mouth inner as individual line segments
      mouthInner: facialFeatures.mouthInner.map((_: any, i: number, arr: any[]) => 
        i < arr.length - 1 ? [arr[i], arr[i + 1]] : null
      ).filter(Boolean)
    };
    
    // Draw connections
    Object.entries(connections).forEach(([featureName, featureConnections]) => {
      if (featureName.includes('Eye')) {
        overlayCtx.strokeStyle = $poseColors.face;
        overlayCtx.lineWidth = 1;
      } else if (featureName.includes('Eyebrow')) {
        overlayCtx.strokeStyle = $poseColors.face;
        overlayCtx.lineWidth = 1;
      } else if (featureName.includes('mouth')) {
        overlayCtx.strokeStyle = $poseColors.face;
        overlayCtx.lineWidth = 3;
      }
      
      featureConnections.forEach(([startIdx, endIdx]: [number, number]) => {
        if (startIdx < landmarks.length && endIdx < landmarks.length) {
          const start = landmarks[startIdx];
          const end = landmarks[endIdx];
          
          // Convert normalized coordinates to canvas coordinates
          const startX = offsetX + start.x * displayWidth;
          const startY = offsetY + start.y * displayHeight;
          const endX = offsetX + end.x * displayWidth;
          const endY = offsetY + end.y * displayHeight;
          
          overlayCtx.beginPath();
          overlayCtx.moveTo(startX, startY);
          overlayCtx.lineTo(endX, endY);
          overlayCtx.stroke();
        }
      });
    });
    
    overlayCtx.globalAlpha = 1.0; // Reset alpha
  }

  function drawGameElements() {
    if (!gameService || !overlayCtx) return;

    // Draw current target (adjust for scaling and offset)
    const currentTarget = gameService.getCurrentTarget();
    
    // Don't draw targets if hand trials are completed
    if (gameMode === GAME_MODES.HANDS_FIXED) {
      const handsState = gameService.getHandsCenteringState();
      if (handsState && handsState.phase === 'completed') {
        return; // Exit early, don't draw any targets
      }
    }
    
    if (currentTarget) {
      overlayCtx.fillStyle = currentTarget.color;
      overlayCtx.strokeStyle = currentTarget.color;
      overlayCtx.lineWidth = 3;
      
      // Convert target coordinates to match the scaled video area
      const targetX = offsetX + (currentTarget.x / width) * displayWidth;
      const targetY = offsetY + (currentTarget.y / height) * displayHeight;
      const targetRadius = Math.min(displayWidth, displayHeight) * 0.04; // Dynamic scaling based on display size
      
      overlayCtx.beginPath();
      overlayCtx.arc(targetX, targetY, targetRadius, 0, 2 * Math.PI);
      overlayCtx.lineWidth = 4; // Thicker border for visibility
      overlayCtx.stroke();
      
      overlayCtx.globalAlpha = 0.8; // Much more solid fill
      overlayCtx.fill();
      overlayCtx.globalAlpha = 1.0;
      
      // Add emoji based on target type
      overlayCtx.save();
      overlayCtx.globalAlpha = 1.0;
      overlayCtx.font = `${targetRadius * 1.2}px Arial`;
      overlayCtx.textAlign = 'center';
      overlayCtx.textBaseline = 'middle';
      
      let emoji = '';
      if (currentTarget.type === 'hand') {
        emoji = '🖐️';
      } else if (currentTarget.type === 'hand-left') {
        emoji = '🖐️'; // Smiley face for head targets
      } else if (currentTarget.type === 'hand-right') {
        emoji = '🖐️'; // Smiley face for head targets
      } else if (currentTarget.type === 'head') {
        emoji = '😃'; // Smiley face for head targets
      } else if (currentTarget.type === 'knee') {
        emoji = '🦵';
      }
      
      if (emoji) {
        overlayCtx.fillStyle = '#ffffff';
        overlayCtx.strokeStyle = '#000000';
        overlayCtx.lineWidth = 1;
        overlayCtx.strokeText(emoji, targetX, targetY);
        overlayCtx.fillText(emoji, targetX, targetY);
      }
      
      overlayCtx.restore();
    }

    // Draw hip sway regions for hip sway game
    if (gameMode === GAME_MODES.HIPS_SWAY) {
      drawHipSwayRegions();
    }

    // Draw centering markers for fixed games
    if (gameMode === GAME_MODES.HANDS_FIXED || gameMode === GAME_MODES.HEAD_FIXED) {
      drawCenteringMarkers();
    }

    // Draw explosions
    drawExplosions();
    
    // Draw hand trial indicators for HANDS_FIXED mode
    if (gameMode === GAME_MODES.HANDS_FIXED) {
      drawHandTrialIndicators();
    }
  }

  function drawHipSwayRegions() {
    if (!gameService || !overlayCtx) return;

    const hipRegions = gameService.generateHipSwayRegions();
    const hipSwayState = gameService.getHipSwayState();
    const themeColors = currentGameColors;
    
    overlayCtx.strokeStyle = currentUIColors.onBackground;
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([5, 5]);

    // Convert hip regions to scaled coordinates
    const leftX = offsetX + (hipRegions.leftRegion.x / width) * displayWidth;
    const leftY = offsetY + (hipRegions.leftRegion.y / height) * displayHeight;
    const leftW = (hipRegions.leftRegion.width / width) * displayWidth;
    const leftH = (hipRegions.leftRegion.height / height) * displayHeight;
    
    const rightX = offsetX + (hipRegions.rightRegion.x / width) * displayWidth;
    const rightY = offsetY + (hipRegions.rightRegion.y / height) * displayHeight;
    const rightW = (hipRegions.rightRegion.width / width) * displayWidth;
    const rightH = (hipRegions.rightRegion.height / height) * displayHeight;
    
    const centerX = offsetX + (hipRegions.centerLine.x / width) * displayWidth;
    const centerY = offsetY + (hipRegions.centerLine.y / height) * displayHeight;
    const centerH = (hipRegions.centerLine.height / height) * displayHeight;

    // Calculate fade effect after collision
    const currentTime = Date.now();
    const timeSinceHit = currentTime - lastHipHitTime;
    const fadeDuration = 1000; // 1 second fade
    
    let currentOpacity = fadeOpacity;
    if (timeSinceHit < fadeDuration) {
      // Fade out effect after hit
      const fadeProgress = timeSinceHit / fadeDuration;
      currentOpacity = fadeOpacity * (1 - fadeProgress * 0.5); // Fade to 50% of base opacity
    }

    // Draw left region with target highlighting
    if (hipSwayState.targetSide === 'left') {
      overlayCtx.fillStyle = themeColors.hipLeft + Math.floor(currentOpacity * 255).toString(16).padStart(2, '0');
      overlayCtx.fillRect(leftX, leftY, leftW, leftH);
      overlayCtx.strokeStyle = themeColors.hipLeft;
      overlayCtx.lineWidth = 3;
    } else {
      overlayCtx.strokeStyle = '#ffffff';
      overlayCtx.lineWidth = 2;
    }
    overlayCtx.strokeRect(leftX, leftY, leftW, leftH);

    // Draw right region with target highlighting
    if (hipSwayState.targetSide === 'right') {
      overlayCtx.fillStyle = themeColors.hipRight + Math.floor(currentOpacity * 255).toString(16).padStart(2, '0');
      overlayCtx.fillRect(rightX, rightY, rightW, rightH);
      overlayCtx.strokeStyle = themeColors.hipRight;
      overlayCtx.lineWidth = 3;
    } else {
      overlayCtx.strokeStyle = '#ffffff';
      overlayCtx.lineWidth = 2;
    }
    overlayCtx.strokeRect(rightX, rightY, rightW, rightH);

    // Draw center line
    overlayCtx.strokeStyle = '#ffffff';
    overlayCtx.setLineDash([]);
    overlayCtx.beginPath();
    overlayCtx.moveTo(centerX, centerY);
    overlayCtx.lineTo(centerX, centerY + centerH);
    overlayCtx.stroke();
  }

  function drawCenteringMarkers() {
    if (!gameService || !overlayCtx) return;

    overlayCtx.strokeStyle = '#ffffff';
    overlayCtx.lineWidth = 3;

    if (gameMode === GAME_MODES.HANDS_FIXED) {
      const handsState = gameService.getHandsCenteringState();
      
      // Only draw centering targets during the centering phase
      if (handsState.phase === 'centering') {
        // Convert coordinates to scaled video area
        const leftX = offsetX + (handsState.leftCenterX / width) * displayWidth;
        const leftY = offsetY + (handsState.leftCenterY / height) * displayHeight;
        const rightX = offsetX + (handsState.rightCenterX / width) * displayWidth;
        const rightY = offsetY + (handsState.rightCenterY / height) * displayHeight;
        const crossSize = Math.min(displayWidth, displayHeight) * 0.06; // Dynamic cross size
        
        // Draw left center cross
        drawCross(leftX, leftY, crossSize);
        
        // Draw right center cross
        drawCross(rightX, rightY, crossSize);
      }
    }

    if (gameMode === GAME_MODES.HEAD_FIXED) {
      const headState = gameService.getHeadCenteringState();
      
      // Only draw centering targets during the centering phase
      if (headState.phase === 'centering') {
        // Convert coordinates to scaled video area
        const centerX = offsetX + (headState.centerX / width) * displayWidth;
        const centerY = offsetY + (headState.centerY / height) * displayHeight;
        const crossSize = Math.min(displayWidth, displayHeight) * 0.06; // Dynamic cross size
        
        // Draw head center cross
        drawCross(centerX, centerY, crossSize);
      }
    }
  }

  function drawCross(x: number, y: number, size: number) {
    if (!overlayCtx) return;

    overlayCtx.save();
    
    // Set semi-transparency for the entire centering target
    overlayCtx.globalAlpha = 0.7; // 70% opacity
    
    // Draw filled blue circle background
    overlayCtx.fillStyle = '#4169E1'; // Royal blue
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, size * 0.8, 0, 2 * Math.PI);
    overlayCtx.fill();
    
    // Draw white "+" symbol on top
    overlayCtx.strokeStyle = '#FFFFFF'; // White
    overlayCtx.lineWidth = 4; // Thick lines for visibility
    overlayCtx.lineCap = 'round';
    
    // Draw the "+" symbol (slightly smaller than the circle)
    const crossSize = size * 0.6;
    overlayCtx.beginPath();
    overlayCtx.moveTo(x - crossSize/2, y);
    overlayCtx.lineTo(x + crossSize/2, y);
    overlayCtx.moveTo(x, y - crossSize/2);
    overlayCtx.lineTo(x, y + crossSize/2);
    overlayCtx.stroke();
    
    overlayCtx.restore();
  }

  function drawHandTrialIndicators() {
    if (!gameService || !overlayCtx) return;
    
    const handsState = gameService.getHandsCenteringState();
    const themeColors = currentGameColors;
    
    // Only show indicators during hands trials, but not when completed
    if (!handsState || handsState.phase === 'completed') return;
    
    overlayCtx.save();
    
    // Set font properties for large letters
    overlayCtx.font = 'bold 240px Arial';
    overlayCtx.textAlign = 'center';
    overlayCtx.textBaseline = 'middle';
    
    // Position letters in top corners (with enough margin for large font)
    const margin = 120;  // Increase margin to account for 240px font
    const leftX = margin;
    const rightX = overlayCanvas.width - margin;
    const letterY = margin;
    
    // Determine colors based on game phase and state
    let leftColor = '#999999';  // Default grey
    let rightColor = '#999999'; // Default grey
    let showLeft = true;
    let showRight = true;
    
    if (handsState.phase === 'centering') {
      if (handsState.primaryHand === null) {
        // Initial centering phase - both letters white to match centering targets
        leftColor = '#ffffff';  // White to match centering targets
        rightColor = '#ffffff'; // White to match centering targets
      } else {
        // Secondary hand trial centering phase - both letters should appear white
        leftColor = '#ffffff';  // White to match centering targets
        rightColor = '#ffffff'; // White to match centering targets
      }
    } else if (handsState.phase === 'targeting') {
      // During targeting phase
      const currentTargetIndex = gameService.getCurrentFixedTargetIndex();
      
      if (handsState.currentTrial === 1 && currentTargetIndex === 1) {
        // First target (grey selection target) - both letters grey
        leftColor = '#999999';
        rightColor = '#999999';
      } else {
        // Active targeting phase - only show the active hand in its color
        // Note: activeHand refers to the game logic hand, we need to show opposite letter due to mirrored view
        showLeft = handsState.activeHand === 'right';  // Show L when right hand is active
        showRight = handsState.activeHand === 'left';   // Show R when left hand is active
        
        if (handsState.activeHand === 'left') {
          rightColor = themeColors.handLeft;  // Right side shows left hand color
        } else if (handsState.activeHand === 'right') {
          leftColor = themeColors.handRight;  // Left side shows right hand color
        }
      }
    }
    
    // Draw letters with stroke for better visibility
    overlayCtx.strokeStyle = '#000000';
    overlayCtx.lineWidth = 3;
    
    // Show correct letters on correct sides (accounting for mirrored view)
    if (showLeft) {
      overlayCtx.fillStyle = leftColor;
      overlayCtx.strokeText('L', leftX, letterY);  // Show L on left side
      overlayCtx.fillText('L', leftX, letterY);
    }
    
    if (showRight) {
      overlayCtx.fillStyle = rightColor;
      overlayCtx.strokeText('R', rightX, letterY);  // Show R on right side
      overlayCtx.fillText('R', rightX, letterY);
    }
    
    overlayCtx.restore();
  }

  function drawExplosions() {
    if (!gameService || !overlayCtx) return;

    const explosions = gameService.getActiveExplosions();
    
    explosions.forEach(explosion => {
      explosion.particles.forEach(particle => {
        const alpha = particle.life / particle.maxLife;
        overlayCtx.globalAlpha = alpha;
        overlayCtx.fillStyle = particle.color;
        
        // Convert explosion coordinates to match the scaled video area
        const particleX = offsetX + (particle.x / width) * displayWidth;
        const particleY = offsetY + (particle.y / height) * displayHeight;
        const particleSize = (particle.size / width) * displayWidth;
        
        overlayCtx.beginPath();
        overlayCtx.arc(particleX, particleY, particleSize, 0, 2 * Math.PI);
        overlayCtx.fill();
      });
    });
    
    overlayCtx.globalAlpha = 1.0;
    
    // Update explosions
    gameService.updateExplosions();
  }

  function drawGameInstructions() {
    if (!gameService || !overlayCtx) return;

    // Get game states
    const hipSwayState = gameService.getHipSwayState();
    const handsState = gameService.getHandsCenteringState();
    const headState = gameService.getHeadCenteringState();

    overlayCtx.save();
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.textAlign = 'center';
    
    // Draw instructions based on game mode and phase
    if (gameMode === GAME_MODES.HIPS_SWAY && hipSwayState.phase === 'centering') {
      overlayCtx.font = '24px Arial';
      overlayCtx.fillText('Center your hips between the regions', width / 2, 100);
      
      overlayCtx.font = '18px Arial';
      overlayCtx.fillStyle = '#cccccc';
      if (hipSwayState.isCentered) {
        overlayCtx.fillText('Hold position for 2 seconds...', width / 2, height - 50);
      } else {
        overlayCtx.fillText('Move to the center line', width / 2, height - 50);
      }
    }
    
    if (gameMode === GAME_MODES.HANDS_FIXED && handsState.phase === 'centering') {
      overlayCtx.font = '24px Arial';
      
      if (handsState.primaryHand === null) {
        overlayCtx.fillText('Touch either center cross to select primary hand', width / 2, 100);
      } else {
        const trialText = handsState.currentTrial === 1 ? 'Primary Hand Trial' : 'Secondary Hand Trial';
        const handText = handsState.activeHand === 'left' ? 'Right Hand' : 'Left Hand';
        overlayCtx.fillText(`${trialText}: ${handText}`, width / 2, 100);
      }
      
      overlayCtx.font = '18px Arial';
      overlayCtx.fillStyle = '#cccccc';
      if (handsState.isCentered) {
        overlayCtx.fillText('Hold position for 2 seconds...', width / 2, height - 50);
      } else {
        overlayCtx.fillText('Place your hand on the center cross', width / 2, height - 50);
      }
    }
    
    if (gameMode === GAME_MODES.HEAD_FIXED && headState.phase === 'centering') {
      overlayCtx.font = '24px Arial';
      overlayCtx.fillText('Position your head on the cross', width / 2, 100);
      
      overlayCtx.font = '18px Arial';
      overlayCtx.fillStyle = '#cccccc';
      if (headState.isCentered) {
        overlayCtx.fillText('Hold position for 2 seconds...', width / 2, height - 50);
      } else {
        overlayCtx.fillText('Move your head to the center cross', width / 2, height - 50);
      }
    }
    
    overlayCtx.restore();
  }

  function drawUI() {
    if (!overlayCtx) return;

    // Draw FPS counter
    // FPS display moved to bottom status area
    // overlayCtx.fillStyle = '#ffffff';
    // overlayCtx.font = '16px Arial';
    // overlayCtx.fillText(`FPS: ${currentFps}`, 10, 30);

    // Draw participant info
    if (participantInfo.participantId) {
      overlayCtx.fillText(`ID: ${participantInfo.participantId}`, 10, 55);
    }

    // Draw mode indicator
    // overlayCtx.font = '18px Arial';
    // overlayCtx.fillStyle = isDataCollectionMode ? '#00ff88' : '#ff8800';
    // overlayCtx.fillText(isDataCollectionMode ? '📊 Data Collection' : '🏃 Practice Mode', 10, 80);

    // // Draw game score if active
    // if (gameActive) {
    //   overlayCtx.font = '24px Arial';
    //   overlayCtx.fillStyle = '#ffffff';
    //   overlayCtx.fillText(`Score: ${gameScore}`, 10, 110);
    // }
  }

  function drawDelayVisuals() {
    if (!overlayCtx) return;
    
    // Handle manual countdown mode
    if (isCountdownActive) {
      drawManualCountdown();
      return;
    }
    
    // Handle flow mode delay
    if (!gameFlowState || gameFlowState.phase !== 'delay') return;
    
    // Get the next game mode (during delay, we want to show what's coming next)
    const gameSequence = [GAME_MODES.HIPS_SWAY, GAME_MODES.HANDS_FIXED, GAME_MODES.HEAD_FIXED, GAME_MODES.RANDOM];
    const nextGameIndex = gameFlowState.currentGameIndex + 1;
    const nextGame = nextGameIndex < gameSequence.length ? gameSequence[nextGameIndex] : null;
    
    if (!nextGame) return; // No next game to show
    
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.15; // 15% of smaller dimension
    
    // Calculate progress (0 to 1) - use the actual delay time from game flow state
    const totalDelay = 15000; // 15 seconds
    const progress = 1 - (gameFlowState.delayRemaining / totalDelay);
    
    overlayCtx.save();
    
    // Draw countdown circle timer
    overlayCtx.globalAlpha = 0.8;
    
    // Background circle
    overlayCtx.strokeStyle = '#333';
    overlayCtx.lineWidth = 8;
    overlayCtx.beginPath();
    overlayCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    overlayCtx.stroke();
    
    // Progress circle (counts down)
    overlayCtx.strokeStyle = '#4CAF50';
    overlayCtx.lineWidth = 8;
    overlayCtx.lineCap = 'round';
    overlayCtx.beginPath();
    // Start from top (-π/2) and draw clockwise, but reverse progress for countdown
    const endAngle = -Math.PI / 2 + (1 - progress) * 2 * Math.PI;
    overlayCtx.arc(centerX, centerY, radius, -Math.PI / 2, endAngle);
    overlayCtx.stroke();
    
    // Draw countdown number in center
    const secondsRemaining = Math.ceil(gameFlowState.delayRemaining / 1000);
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.font = 'bold 64px Arial'; // Increased size
    overlayCtx.textAlign = 'center';
    overlayCtx.textBaseline = 'middle';
    overlayCtx.fillText(secondsRemaining.toString(), centerX, centerY);
    
    // Draw next game mode text
    const nextGameText = getGameDisplayName(nextGame);
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.font = 'bold 48px Arial';
    overlayCtx.textAlign = 'center';
    overlayCtx.fillText(`Next: ${nextGameText}`, centerX, centerY - radius - 100);
    
    // Draw task description
    const taskDescription = getTaskDescription(nextGame);
    overlayCtx.fillStyle = '#cccccc';
    overlayCtx.font = '32px Arial';
    overlayCtx.textAlign = 'center';
    overlayCtx.fillText(taskDescription, centerX, centerY - radius - 50);
    
    overlayCtx.restore();
  }

  // Helper functions for game display names and descriptions
  function getGameDisplayName(gameMode: GameMode): string {
    switch (gameMode) {
      case GAME_MODES.HIPS_SWAY:
        return 'Hips';
      case GAME_MODES.HANDS_FIXED:
        return 'Hands';
      case GAME_MODES.HEAD_FIXED:
        return 'Head';
      case GAME_MODES.RANDOM:
        return 'Random';
      default:
        return gameMode;
    }
  }
  
  function getTaskDescription(gameMode: GameMode): string {
    switch (gameMode) {
      case GAME_MODES.HIPS_SWAY:
        return 'Sway your hips left and right';
      case GAME_MODES.HANDS_FIXED:
        return 'Move your hands in a figure-8 pattern';
      case GAME_MODES.HEAD_FIXED:
        return 'Move your head in a circle';
      case GAME_MODES.RANDOM:
        return 'Hit the random targets';
      default:
        return 'Follow the on-screen instructions';
    }
  }

  function drawManualCountdown() {
    if (!overlayCtx) return;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.15; // 15% of smaller dimension
    
    // Calculate progress (0 to 1) for manual countdown
    const totalDelay = 15000; // 15 seconds
    const progress = 1 - (countdownRemaining * 1000 / totalDelay);
    
    overlayCtx.save();
    
    // Draw countdown circle timer
    overlayCtx.globalAlpha = 0.8;
    
    // Background circle
    overlayCtx.strokeStyle = '#333';
    overlayCtx.lineWidth = 8;
    overlayCtx.beginPath();
    overlayCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    overlayCtx.stroke();
    
    // Progress circle (counts down)
    overlayCtx.strokeStyle = '#4CAF50';
    overlayCtx.lineWidth = 8;
    overlayCtx.lineCap = 'round';
    overlayCtx.beginPath();
    // Start from top (-π/2) and draw clockwise, but reverse progress for countdown
    const endAngle = -Math.PI / 2 + (1 - progress) * 2 * Math.PI;
    overlayCtx.arc(centerX, centerY, radius, -Math.PI / 2, endAngle);
    overlayCtx.stroke();
    
    // Draw countdown number in center
    const secondsRemaining = countdownRemaining;
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.font = 'bold 64px Arial'; // Increased size
    overlayCtx.textAlign = 'center';
    overlayCtx.textBaseline = 'middle';
    overlayCtx.fillText(secondsRemaining.toString(), centerX, centerY);
    
    // Draw current game mode text
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.font = 'bold 48px Arial';
    overlayCtx.textAlign = 'center';
    overlayCtx.fillText(`Starting: ${getGameDisplayName(gameMode)}`, centerX, centerY - radius - 100);
    
    // Draw task description
    const taskDescription = getTaskDescription(gameMode);
    overlayCtx.fillStyle = '#cccccc';
    overlayCtx.font = '32px Arial';
    overlayCtx.textAlign = 'center';
    overlayCtx.fillText(taskDescription, centerX, centerY - radius - 50);
    
    overlayCtx.restore();
  }

  // Game control functions
  export function updateGameMode(newGameMode: GameMode) {
    if (!gameService) return;
    gameService.updateGameMode(newGameMode);
  }

  export function startGame() {
    if (!gameService) return;
    
    gameService.startGame();
    gameScore = 0;
    scoreBreakdown = { hand: 0, head: 0, knee: 0 };
    
    dispatch('gameStarted', { score: gameScore, scoreBreakdown });
  }

  export function stopGame() {
    if (!gameService) return;
    
    gameService.stopGame();
    dispatch('gameEnded', { finalScore: gameScore, scoreBreakdown });
  }

  export function getTargetHistory() {
    if (!gameService) return [];
    return gameService.getTargetHistory();
  }

  // Export method to get current FPS for status display
  export function getCurrentFPS() {
    return currentFps;
  }

  // Export methods to get status indicators for bottom status bar
  export function getStatusIndicators() {
    return {
      isMediaPipeLoaded,
      hasVideoStream: !!videoStream,
      isGameActive: gameActive
    };
  }

  // Reactive statements
  $: if (gameService && gameMode) {
    gameService.updateGameMode(gameMode);
  }

  $: if (gameService) {
    gameService.updateDimensions(width, height);
  }

  // Handle canvas resize
  $: if (overlayCanvas) {
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    overlayCtx = overlayCanvas.getContext('2d')!;
  }

  // Reactive updates for scaling
  $: if (width || height) {
    calculateVideoScaling();
  }
</script>

<div class="webcam-native-container" style="width: {width}px; height: {height}px;">
  <!-- Video element (mirrored and scaled) -->
  <!-- svelte-ignore a11y-media-has-caption -->
  <video
    bind:this={videoElement}
    class="webcam-video"
    muted
    playsinline
    style="
      width: {displayWidth}px; 
      height: {displayHeight}px;
      left: {offsetX}px;
      top: {offsetY}px;
    "
  ></video>
  
  <!-- Overlay canvas for drawing -->
  <canvas
    bind:this={overlayCanvas}
    class="overlay-canvas"
    {width}
    {height}
  ></canvas>

  <!-- Status indicators moved to main page bottom status bar -->
</div>

<style>
  .webcam-native-container {
    position: relative;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
  }

  .webcam-video {
    position: absolute;
    transform: scaleX(-1); /* Mirror the video for natural mirror effect */
    object-fit: contain; /* Maintain aspect ratio with letterboxing */
    background: #000;
  }

  .overlay-canvas {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 1;
  }



</style>