<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import type { PoseResults } from '../services/mediaPipeService.js';
  import type { GameMode } from '../services/gameService.js';
  import { GameService, GAME_MODES } from '../services/gameService.js';
  import { poseColors, gameColors, uiColors } from '../stores/themeStore.js';

  // Component props
  export let width = 1920;
  export let height = 1080;
  export let gameActive = false;
  export let gameMode: GameMode = GAME_MODES.RANDOM;
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

  // Game state
  let gameService: GameService | null = null;
  let currentPoseData: PoseResults | null = null;
  let gameScore = 0;
  let scoreBreakdown = { hand: 0, head: 0, knee: 0 };

  // Performance monitoring
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 0;

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
      // Dynamic import to avoid SSR issues
      const mediaPipeModule = await import('@mediapipe/holistic');
      const cameraModule = await import('@mediapipe/camera_utils');

      const { Holistic } = mediaPipeModule;
      const { Camera } = cameraModule;

      // Initialize Holistic
      holistic = new Holistic({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
      });

      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        selfieMode: true // Enable selfie mode for automatic mirroring
      });

      holistic.onResults(onPoseResults);

      // Initialize camera
      if (videoElement) {
        camera = new Camera(videoElement, {
          onFrame: async () => {
            if (holistic && videoElement) {
              await holistic.send({ image: videoElement });
            }
          },
          width: width,
          height: height
        });

        camera.start();
        isMediaPipeLoaded = true;
      }
    } catch (error) {
      console.error('Error initializing MediaPipe:', error);
    }
  }

  function initializeGame() {
    gameService = new GameService(width, height, gameMode);
  }

  function onPoseResults(results: PoseResults) {
    currentPoseData = results;
    frameCount++;
    
    // Calculate FPS
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      frameCount = 0;
      lastFpsTime = now;
    }

    // Dispatch pose update
    dispatch('poseUpdate', results);

    // Handle game logic if game is active
    if (gameActive && gameService) {
      const collision = gameService.checkCollisions(results);
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

    // Draw game elements
    if (gameActive && gameService) {
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
  }

  function drawHandLandmarks() {
    if (!overlayCtx) return;

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
  }

  function drawFaceConnections(landmarks: any[], facialFeatures: any) {
    if (!overlayCtx) return;
    
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
  }

  function drawGameElements() {
    if (!gameService || !overlayCtx) return;

    // Draw current target (adjust for scaling and offset)
    const currentTarget = gameService.getCurrentTarget();
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
        emoji = '✋';
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

    if (gameMode === GAME_MODES.HEAD_FIXED) {
      const headState = gameService.getHeadCenteringState();
      
      // Convert coordinates to scaled video area
      const centerX = offsetX + (headState.centerX / width) * displayWidth;
      const centerY = offsetY + (headState.centerY / height) * displayHeight;
      const crossSize = Math.min(displayWidth, displayHeight) * 0.06; // Dynamic cross size
      
      // Draw head center cross
      drawCross(centerX, centerY, crossSize);
    }
  }

  function drawCross(x: number, y: number, size: number) {
    if (!overlayCtx) return;

    overlayCtx.save();
    overlayCtx.strokeStyle = '#4169E1'; // Royal blue
    overlayCtx.lineWidth = 4; // Thicker lines for better visibility
    overlayCtx.lineCap = 'round';
    
    // Draw cross
    overlayCtx.beginPath();
    overlayCtx.moveTo(x - size/2, y);
    overlayCtx.lineTo(x + size/2, y);
    overlayCtx.moveTo(x, y - size/2);
    overlayCtx.lineTo(x, y + size/2);
    overlayCtx.stroke();
    
    // Add circle around cross for better visibility
    overlayCtx.strokeStyle = '#4169E1';
    overlayCtx.lineWidth = 2;
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, size * 0.8, 0, 2 * Math.PI);
    overlayCtx.stroke();
    
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
        const handText = handsState.activeHand === 'left' ? 'Left Hand' : 'Right Hand';
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
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.font = '16px Arial';
    overlayCtx.fillText(`FPS: ${currentFps}`, 10, 30);

    // Draw participant info
    if (participantInfo.participantId) {
      overlayCtx.fillText(`ID: ${participantInfo.participantId}`, 10, 55);
    }

    // Draw game score if active
    if (gameActive) {
      overlayCtx.font = '24px Arial';
      overlayCtx.fillText(`Score: ${gameScore}`, 10, 90);
    }
  }

  // Game control functions
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

  <!-- Status indicators -->
  <div class="status-indicators">
    <div class="status-item" class:active={isMediaPipeLoaded}>
      📊 MediaPipe: {isMediaPipeLoaded ? 'Ready' : 'Loading...'}
    </div>
    <div class="status-item" class:active={!!videoStream}>
      📹 Camera: {videoStream ? 'Active' : 'Inactive'}
    </div>
    <div class="status-item" class:active={gameActive}>
      🎮 Game: {gameActive ? 'Active' : 'Inactive'}
    </div>
  </div>
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

  .status-indicators {
    position: absolute;
    bottom: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    z-index: 2;
  }

  .status-item {
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: monospace;
    opacity: 0.7;
    transition: opacity 0.3s ease;
  }

  .status-item.active {
    opacity: 1;
    background: rgba(0, 255, 136, 0.3);
    border: 1px solid rgba(0, 255, 136, 0.5);
  }
</style>