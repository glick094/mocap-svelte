<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import QRScanModal from './QRScanModal.svelte';
  import { gameColors, poseColors } from '../stores/themeStore';
  
  // Type definitions
  interface ScoreBreakdown {
    hand: number;
    head: number;
    knee: number;
  }

  interface ParticipantInfo {
    participantId: string;
    age: number | null;
    height: number | null;
  }

  interface GameModeProgress {
    completed: number;
    total: number;
  }

  interface MediaPipeLandmark {
    x: number;
    y: number;
    z?: number;
    visibility?: number;
  }

  const dispatch = createEventDispatcher<{
    poseUpdate: any;
    streamReady: MediaStream;
    qrCodeDetected: string;
    participantIdChange: string;
  }>();

  export let width: number = 640;
  export let height: number = 480;
  export let gameActive: boolean = false;
  export let gameScore: number = 0;
  export let currentTargetType: string | null = null;
  export let scoreBreakdown: ScoreBreakdown = { hand: 0, head: 0, knee: 0 };
  export let participantInfo: ParticipantInfo = { participantId: '', age: null, height: null };
  export let gameMode: string = 'hips-sway';
  export let gameModeProgress: GameModeProgress = { completed: 0, total: 8 };

  let videoElement: HTMLVideoElement;
  let canvasElement: HTMLCanvasElement;
  let canvasCtx: CanvasRenderingContext2D | null;
  let stream: MediaStream | null;
  let isLoading: boolean = true;
  let error: string | null = null;
  let mounted: boolean = false;
  let retryCount: number = 0;
  let maxRetries: number = 3;
  let initializationInProgress: boolean = false;
  let mediaPipeInitInProgress: boolean = false;

  // MediaPipe variables
  let holistic: any = null;
  let camera: any = null;
  let poseTrackingActive: boolean = false;
  let mediaPipeReady: boolean = false;

  // Toggle controls
  let showPose: boolean = true;
  let showHands: boolean = true;
  let showFace: boolean = true;

  // QR Scanner modal state
  let isQRModalOpen: boolean = false;
  let lastQrScanTime: number = 0;
  const QR_SCAN_THROTTLE: number = 500; // Reduced to 500ms to allow more frequent detection


  // MediaPipe landmark connections
  const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
    [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
    [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
  ];

  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
    [0, 9], [9, 10], [10, 11], [11, 12], // Middle finger
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring finger
    [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [5, 9], [9, 13], [13, 17] // Palm connections
  ];

  const FACE_OVAL_CONNECTIONS = [
    [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389],
    [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
    [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
    [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
    [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162],
    [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10]
  ];

  function drawLandmarks(ctx: CanvasRenderingContext2D, landmarks: MediaPipeLandmark[], color: string = '#FF0000', radius: number = 3): void {
    if (!landmarks || !Array.isArray(landmarks) || !ctx) return;
    
    ctx.fillStyle = color;
    for (const landmark of landmarks) {
      if (landmark && typeof landmark.x === 'number' && typeof landmark.y === 'number' && (landmark.visibility === undefined || landmark.visibility > 0.5)) {
        const x = landmark.x * width;
        const y = landmark.y * height;
        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }
  }

  function drawConnections(ctx: CanvasRenderingContext2D, landmarks: MediaPipeLandmark[], connections: number[][], color: string = '#00FF00', lineWidth: number = 2): void {
    if (!landmarks || !Array.isArray(landmarks) || !connections || !ctx) return;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    
    for (const [start, end] of connections) {
      if (landmarks[start] && landmarks[end]) {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        if (startPoint.x !== undefined && startPoint.y !== undefined && 
            endPoint.x !== undefined && endPoint.y !== undefined &&
            (startPoint.visibility === undefined || startPoint.visibility > 0.5) &&
            (endPoint.visibility === undefined || endPoint.visibility > 0.5)) {
          ctx.beginPath();
          ctx.moveTo(startPoint.x * width, startPoint.y * height);
          ctx.lineTo(endPoint.x * width, endPoint.y * height);
          ctx.stroke();
        }
      }
    }
  }


  function onPoseResults(results: any): void {
    // Early return if no valid results and no canvas to draw on
    const hasLandmarks = results.poseLandmarks || results.leftHandLandmarks || results.rightHandLandmarks || results.faceLandmarks;
    if (!hasLandmarks && !canvasCtx) return;
    
    // Emit pose data for 3D visualization only if we have landmarks
    if (hasLandmarks) {
      dispatch('poseUpdate', {
        poseLandmarks: results.poseLandmarks,
        leftHandLandmarks: results.leftHandLandmarks,
        rightHandLandmarks: results.rightHandLandmarks,
        faceLandmarks: results.faceLandmarks,
        timestamp: performance.now() // More precise than Date.now()
      });
    }
    
    // Always draw results when we have canvas context
    if (canvasCtx) {
      // Clear canvas
      canvasCtx.clearRect(0, 0, width, height);
      
      // Draw video - use results.image if available (MediaPipe Camera), otherwise use videoElement
      if (results.image) {
        canvasCtx.drawImage(results.image, 0, 0, width, height);
      } else if (videoElement && videoElement.videoWidth > 0) {
        canvasCtx.drawImage(videoElement, 0, 0, width, height);
      }
      
      // Draw pose landmarks based on toggle states using theme colors
      if (showPose && results.poseLandmarks) {
        drawConnections(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, $poseColors.torso, 2);
        drawLandmarks(canvasCtx, results.poseLandmarks, $poseColors.torso, 4);
      }
      
      if (showHands) {
        if (results.leftHandLandmarks) {
          drawConnections(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, $poseColors.leftHand, 2);
          drawLandmarks(canvasCtx, results.leftHandLandmarks, $poseColors.leftHand, 3);
        }
        if (results.rightHandLandmarks) {
          drawConnections(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, $poseColors.rightHand, 2);
          drawLandmarks(canvasCtx, results.rightHandLandmarks, $poseColors.rightHand, 3);
        }
      }
      
      if (showFace && results.faceLandmarks) {
        drawConnections(canvasCtx, results.faceLandmarks, FACE_OVAL_CONNECTIONS, $poseColors.face, 1);
        drawLandmarks(canvasCtx, results.faceLandmarks, $poseColors.face, 1);
      }
      
    }
  }

  // Initialize MediaPipe with multiple CDN fallbacks
  async function initializePoseTracking() {
    // Prevent multiple simultaneous MediaPipe initialization attempts
    if (mediaPipeInitInProgress || mediaPipeReady) {
      console.log('MediaPipe initialization already in progress or ready, skipping...');
      return;
    }
    
    mediaPipeInitInProgress = true;
    
    // CDN options to try in order
    const cdnOptions = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629',
      'https://cdn.jsdelivr.net/npm/@mediapipe/holistic',
      'https://unpkg.com/@mediapipe/holistic@0.5.1675471629',
      'https://unpkg.com/@mediapipe/holistic'
    ];
    
    const tryInitializeWithCdn = async (cdnUrl: string): Promise<void> => {
      console.log(`Trying MediaPipe initialization with CDN: ${cdnUrl}`);
      
      try {
        // Add timeout for MediaPipe initialization
        const initTimeout = setTimeout(() => {
          console.warn(`MediaPipe initialization with ${cdnUrl} taking longer than expected...`);
        }, 8000);
        
        // Dynamic import to avoid SSR issues
        const { Holistic } = await import('@mediapipe/holistic');
        const { Camera } = await import('@mediapipe/camera_utils');
        
        console.log('MediaPipe modules loaded');

        // Clean up any existing instances before creating new ones
        if (holistic) {
          try {
            holistic.close();
          } catch (e) {
            console.log('Error closing existing holistic instance:', e);
          }
        }
        if (camera) {
          try {
            camera.stop();
          } catch (e) {
            console.log('Error stopping existing camera instance:', e);
          }
        }

        // Initialize MediaPipe Holistic with current CDN
        holistic = new Holistic({
          locateFile: (file) => {
            return `${cdnUrl}/${file}`;
          }
        });

        // Set options with error handling
        await holistic.setOptions({
          modelComplexity: 0, // Reduced complexity for better performance
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineFaceLandmarks: false,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5
        });

        holistic.onResults(onPoseResults);
        console.log('Holistic configured and onResults callback set');

        // Initialize MediaPipe Camera with error handling
        camera = new Camera(videoElement, {
          onFrame: async () => {
            if (holistic && poseTrackingActive && !mediaPipeInitInProgress && videoElement) {
              try {
                await holistic.send({ image: videoElement });
              } catch (sendErr) {
                console.error('Error sending frame to MediaPipe:', sendErr);
                // If we get repeated frame errors, stop trying to avoid freezing
                if (sendErr && sendErr instanceof Error && sendErr.message.includes('NetworkError')) {
                  console.warn('Network error detected, temporarily pausing MediaPipe processing');
                  setTimeout(() => {
                    console.log('Resuming MediaPipe processing after network error');
                  }, 2000);
                  return;
                }
              }
            }
          },
          width: width,
          height: height
        });

        await camera.start();
        
        clearTimeout(initTimeout);
        poseTrackingActive = true;
        mediaPipeReady = true;
        mediaPipeInitInProgress = false;
        
        console.log(`MediaPipe pose tracking active with CDN: ${cdnUrl}`);
        return true; // Success
        
      } catch (err) {
        console.error(`Failed to initialize MediaPipe with CDN ${cdnUrl}:`, err);
        
        // Clean up failed initialization
        if (holistic) {
          try {
            holistic.close();
          } catch (e) {
            console.log('Error cleaning up failed holistic instance:', e);
          }
          holistic = null;
        }
        if (camera) {
          try {
            camera.stop();
          } catch (e) {
            console.log('Error cleaning up failed camera instance:', e);
          }
          camera = null;
        }
        
        return false; // Failed
      }
    };
    
    // Try each CDN option
    for (let i = 0; i < cdnOptions.length; i++) {
      const success = await tryInitializeWithCdn(cdnOptions[i]);
      if (success) {
        return; // Successfully initialized
      }
      
      console.log(`CDN ${cdnOptions[i]} failed, trying next option...`);
      
      // Wait a bit before trying next CDN
      if (i < cdnOptions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // All CDNs failed
    console.error('All MediaPipe CDN options failed');
    mediaPipeReady = false;
    poseTrackingActive = false;
    mediaPipeInitInProgress = false;
    
    // Continue with just webcam
    console.log('Continuing with basic webcam mode - MediaPipe unavailable');
  }

  async function startBasicWebcam() {
    // Prevent multiple simultaneous initialization attempts
    if (initializationInProgress) {
      console.log('Webcam initialization already in progress, skipping...');
      return;
    }
    
    initializationInProgress = true;
    
    try {
      console.log(`Starting webcam... (attempt ${retryCount + 1}/${maxRetries})`);
      
      if (!videoElement || !canvasElement) {
        initializationInProgress = false;
        throw new Error('Elements not ready');
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Get camera stream
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height }
        }
      });

      console.log('Camera stream obtained');

      // Set up video
      videoElement.srcObject = stream;
      await videoElement.play();
      
      console.log('Video playing');

      // Emit stream ready event for video recording
      dispatch('streamReady', stream);

      // Set up canvas
      canvasCtx = canvasElement.getContext('2d');
      
      // Start pose tracking initialization in background with longer delay
      setTimeout(() => {
        if (!mediaPipeInitInProgress && !mediaPipeReady) {
          initializePoseTracking();
        }
      }, 2000);
      
      // Draw video frames to canvas (fallback for when MediaPipe Camera isn't active)
      function drawFrame() {
        if (videoElement && canvasElement && canvasCtx && !poseTrackingActive) {
          // Clear canvas
          canvasCtx.clearRect(0, 0, width, height);
          
          // Draw video
          canvasCtx.drawImage(videoElement, 0, 0, width, height);
          
        }
        
        // Only continue animation loop if MediaPipe pose tracking isn't active
        if (!poseTrackingActive) {
          requestAnimationFrame(drawFrame);
        }
      }
      
      drawFrame();
      
      isLoading = false;
      retryCount = 0;
      initializationInProgress = false;
      console.log('Webcam working!');
      
    } catch (err) {
      console.error('Webcam error:', err);
      
      if (retryCount < maxRetries - 1) {
        retryCount++;
        console.log(`Auto-retrying in 1 second... (attempt ${retryCount + 1}/${maxRetries})`);
        
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          stream = null;
        }
        
        setTimeout(() => {
          startBasicWebcam();
        }, 1000);
      } else {
        error = err instanceof Error ? err.message : String(err);
        isLoading = false;
        retryCount = 0;
        initializationInProgress = false;
      }
    }
  }

  onMount(() => {
    console.log('Component mounted');
    mounted = true;
    
    // Wait for DOM to be fully ready and elements to be available
    const checkElementsReady = () => {
      if (videoElement && canvasElement) {
        console.log('Elements are ready, checking if we should start webcam...');
        if (isLoading && !initializationInProgress) {
          startBasicWebcam();
        }
        return true;
      }
      return false;
    };
    
    // Try immediately
    if (!checkElementsReady()) {
      // If not ready, check periodically
      const elementCheck = setInterval(() => {
        if (checkElementsReady()) {
          clearInterval(elementCheck);
        }
      }, 100);
      
      // Clear interval after 5 seconds to avoid infinite checking
      setTimeout(() => {
        clearInterval(elementCheck);
      }, 5000);
    }
  });

  // Reactive statement for element readiness - more conservative approach
  $: if (mounted && videoElement && canvasElement && isLoading && !stream && !initializationInProgress) {
    // Add small delay to ensure DOM is fully settled
    setTimeout(() => {
      if (videoElement && canvasElement && isLoading && !stream && !initializationInProgress) {
        console.log('Reactive: Elements ready, starting webcam...');
        startBasicWebcam();
      }
    }, 500);
  }

  function getTargetColor(targetType: string): string {
    // Use theme colors for consistency
    const colors: { [key: string]: string } = {
      'hand': $gameColors.hand,
      'head': $gameColors.head, 
      'knee': $gameColors.knee
    };
    return colors[targetType] || '#ffffff';
  }

  function getBarWidth(score: number): number {
    if (gameScore === 0) return 0;
    return Math.max((score / gameScore) * 100, 0);
  }

  // QR Scanner functions
  function openQRScanner() {
    if (gameActive) {
      console.log('Cannot open QR scanner while game is active');
      return;
    }
    
    // Pause MediaPipe processing while scanning
    pauseMediaPipe();
    isQRModalOpen = true;
  }

  function handleQRResult(event: CustomEvent): void {
    const result = event.detail;
    const now = Date.now();
    if (now - lastQrScanTime < QR_SCAN_THROTTLE) return;
    
    lastQrScanTime = now;
    console.log('QR Code detected:', result);
    dispatch('qrCodeDetected', result);
    
    // Resume MediaPipe after scanning with small delay to ensure QR scanner is properly closed
    setTimeout(() => {
      resumeMediaPipe();
    }, 100);
  }

  function closeQRScanner() {
    isQRModalOpen = false;
    // Resume MediaPipe after closing scanner with delay to ensure proper cleanup
    setTimeout(() => {
      resumeMediaPipe();
    }, 100);
  }

  function pauseMediaPipe() {
    if (camera && poseTrackingActive) {
      try {
        camera.stop();
        poseTrackingActive = false;
        console.log('MediaPipe paused for QR scanning');
      } catch (error: any) {
        console.warn('Error pausing MediaPipe:', error);
      }
    }
  }

  function resumeMediaPipe() {
    if (camera && !poseTrackingActive && mediaPipeReady) {
      try {
        camera.start();
        poseTrackingActive = true;
        console.log('MediaPipe resumed after QR scanning');
      } catch (error: any) {
        console.warn('Error resuming MediaPipe:', error);
      }
    } else {
      console.log('Resume conditions not met:', {
        hasCamera: !!camera,
        poseTrackingActive,
        mediaPipeReady
      });
    }
  }

  function updateParticipantId() {
    dispatch('participantIdChange', participantInfo.participantId);
  }
  
  function getGameModeDisplayName(mode: string): string {
    const modeNames: { [key: string]: string } = {
      'hips-sway': 'Hips Sway',
      'hands-fixed': 'Hands Figure-8',
      'head-fixed': 'Head Circle',
      'random': 'Random Targets'
    };
    return modeNames[mode] || mode;
  }
  
  function getProgressPercentage(): number {
    if (gameModeProgress.total === Infinity) return 0;
    return Math.round((gameModeProgress.completed / gameModeProgress.total) * 100);
  }


  onDestroy(() => {
    console.log('Component destroying');
    
    // Close QR scanner modal if open
    if (isQRModalOpen) {
      isQRModalOpen = false;
    }
    
    // Stop MediaPipe camera if active
    if (camera) {
      try {
        camera.stop();
      } catch (err) {
        console.log('Error stopping MediaPipe camera:', err);
      }
    }
    
    // Close MediaPipe holistic
    if (holistic) {
      try {
        holistic.close();
      } catch (err) {
        console.log('Error closing MediaPipe holistic:', err);
      }
    }
    
    // Stop regular webcam stream if active
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  });
</script>

<div class="webcam-container">
  <!-- <h3>MediaPipe Pose Tracking</h3> -->
  
  <!-- Participant ID Input -->
  <div class="participant-section">
    <label for="participant-id" class="participant-label">Participant ID:</label>
    <div class="participant-input-group">
      <input 
        id="participant-id"
        type="text" 
        bind:value={participantInfo.participantId}
        on:input={updateParticipantId}
        placeholder="Enter ID manually"
        class="participant-input"
      />
      <button 
        class="qr-scan-btn"
        on:click={openQRScanner}
        disabled={gameActive}
        title={gameActive ? 'Cannot scan QR code while game is active' : 'Scan QR code for participant info'}
      >
        📷 QR
      </button>
    </div>
    {#if participantInfo.age || participantInfo.height}
      <div class="participant-info">
        {#if participantInfo.age}Age: {participantInfo.age}{/if}
        {#if participantInfo.height}{participantInfo.age ? ', ' : ''}Height: {participantInfo.height}{/if}
      </div>
    {/if}
  </div>

  <!-- MediaPipe Status -->
  {#if !isLoading && !error}
    <div class="status-indicator">
      {#if !mediaPipeReady}
        <span class="status-loading">🔄 Loading MediaPipe...</span>
      {:else if poseTrackingActive}
        <span class="status-active">✓ MediaPipe Active</span>
      {:else}
        <span class="status-failed">⚠️ MediaPipe failed to load</span>
      {/if}
    </div>
  {/if}
  
  <!-- Always render video elements -->
  <div class="video-container" style="display: {isLoading || error ? 'none' : 'block'}">
    <video
      bind:this={videoElement}
      style="display: none;"
      playsinline
      muted
      autoplay
    >
      <track kind="captions" src="" label="No captions available" default />
    </video>
    
    <canvas
      bind:this={canvasElement}
      class="output-canvas"
      {width}
      {height}
    ></canvas>
  </div>
  
  <!-- Control buttons -->
  {#if !isLoading && !error}
    <div class="controls">
      <div class="toggle-group">
        <label class="toggle-btn" class:active={showPose}>
          <input type="checkbox" bind:checked={showPose} />
          <span class="btn-content">
            <span class="dot pose-dot"></span>
            Pose
          </span>
        </label>
        
        <label class="toggle-btn" class:active={showHands}>
          <input type="checkbox" bind:checked={showHands} />
          <span class="btn-content">
            <span class="dot hands-dot"></span>
            Hands
          </span>
        </label>
        
        <label class="toggle-btn" class:active={showFace}>
          <input type="checkbox" bind:checked={showFace} />
          <span class="btn-content">
            <span class="dot face-dot"></span>
            Face
          </span>
        </label>
      </div>
      
      <!-- Game Score Display -->
      {#if gameActive}
        <div class="game-score">
          <div class="mode-display">
            <span class="mode-label">Mode:</span>
            <span class="mode-name">{getGameModeDisplayName(gameMode)}</span>
          </div>
          
          <div class="score-display">
            <span class="score-label">Score:</span>
            <span class="score-value">{gameScore}</span>
          </div>
          
          <div class="progress-display">
            <span class="progress-label">Progress:</span>
            <span class="progress-value">
              {gameModeProgress.completed}/{gameModeProgress.total === Infinity ? '∞' : gameModeProgress.total}
              {#if gameModeProgress.total !== Infinity}
                ({getProgressPercentage()}%)
              {/if}
            </span>
          </div>
          
          {#if currentTargetType && gameMode === 'random'}
            <div class="target-info">
              <span class="target-label">Current Target:</span>
              <span class="target-type" style="color: {getTargetColor(currentTargetType)}">
                {String(currentTargetType || '').toUpperCase()}
              </span>
            </div>
          {/if}
          
          <!-- Score Breakdown Bar Chart -->
          <div class="score-breakdown">
            <div class="breakdown-title">Score Breakdown:</div>
            
            <div class="chart-item">
              <div class="chart-label">
                <span class="chart-icon" style="color: {$gameColors.hand};">✋</span>
                <span>Hands: {scoreBreakdown.hand}</span>
              </div>
              <div class="chart-bar">
                <div 
                  class="chart-fill" 
                  style="width: {getBarWidth(scoreBreakdown.hand)}%; background-color: {$gameColors.hand};"
                ></div>
              </div>
            </div>
            
            <div class="chart-item">
              <div class="chart-label">
                <span class="chart-icon" style="color: {$gameColors.head};">😀</span>
                <span>Head: {scoreBreakdown.head}</span>
              </div>
              <div class="chart-bar">
                <div 
                  class="chart-fill" 
                  style="width: {getBarWidth(scoreBreakdown.head)}%; background-color: {$gameColors.head};"
                ></div>
              </div>
            </div>
            
            <div class="chart-item">
              <div class="chart-label">
                <span class="chart-icon" style="color: {$gameColors.knee};">🦵</span>
                <span>Knees: {scoreBreakdown.knee}</span>
              </div>
              <div class="chart-bar">
                <div 
                  class="chart-fill" 
                  style="width: {getBarWidth(scoreBreakdown.knee)}%; background-color: {$gameColors.knee};"
                ></div>
              </div>
            </div>
          </div>
        </div>
      {/if}
      
      <!-- <div class="status-info">
        <span class="status-text">
          {#if !mediaPipeReady}
            🔄 Loading MediaPipe...
          {:else if poseTrackingActive}
            ✅ Pose tracking active
          {:else}
            ⚠️ MediaPipe failed to load
          {/if}
        </span>
      </div> -->
    </div>
  {/if}
  
  {#if isLoading}
    <div class="loading">
      <p>Loading webcam...</p>
      <div class="spinner"></div>
    </div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
      <button on:click={() => {
        console.log('Manual retry clicked');
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          stream = null;
        }
        if (camera) {
          try {
            camera.stop();
          } catch (e) {
            console.log('Error stopping camera during manual retry:', e);
          }
          camera = null;
        }
        if (holistic) {
          try {
            holistic.close();
          } catch (e) {
            console.log('Error closing holistic during manual retry:', e);
          }
          holistic = null;
        }
        
        poseTrackingActive = false;
        mediaPipeReady = false;
        mediaPipeInitInProgress = false;
        initializationInProgress = false;
        isLoading = true;
        error = null;
        retryCount = 0;
      }}>
        Retry
      </button>
    </div>
  {/if}
</div>

<!-- QR Scanner Modal -->
<QRScanModal 
  bind:isOpen={isQRModalOpen}
  cameraStream={stream}
  on:qrCodeDetected={handleQRResult}
  on:close={closeQRScanner}
/>

<style>
  .webcam-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0;
    width: 100%;
    height: 100%;
  }

  .video-container {
    position: relative;
  }

  .output-canvas {
    border: 1px solid #555;
    border-radius: 8px;
    max-width: 100%;
    width: 100%;
    height: auto;
    display: block;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    transform: scaleX(-1); /* Mirror the webcam horizontally */
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }

  .toggle-group {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .toggle-btn {
    position: relative;
    cursor: pointer;
    display: block;
  }

  .toggle-btn input {
    display: none;
  }

  .btn-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    background: #f8f9fa;
    border: 2px solid #dee2e6;
    border-radius: 8px;
    font-weight: 600;
    transition: all 0.2s ease;
    user-select: none;
  }

  .toggle-btn.active .btn-content {
    background: #e7f3ff;
    border-color: #007bff;
    color: #007bff;
  }

  .toggle-btn:hover .btn-content {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }

  .pose-dot {
    background: #00FF00;
  }

  .hands-dot {
    background: linear-gradient(45deg, #FF0000, #0000FF);
  }

  .face-dot {
    background: #FFFF00;
  }


  .loading, .error {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    padding: 2rem;
    text-align: center;
    gap: 1rem;
  }

  .loading p, .error p {
    font-size: 1.2rem;
    margin: 0;
  }

  .loading p {
    color: #666;
  }

  .error p {
    color: #ff4444;
  }

  .error button {
    background: #667eea;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
  }

  .error button:hover {
    background: #5a67d8;
    transform: translateY(-1px);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Game Score Styles */
  .game-score {
    margin-top: 1rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .mode-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .mode-label {
    color: #ccc;
    font-size: 0.9rem;
    font-weight: 500;
  }
  
  .mode-name {
    color: #00ff88;
    font-size: 1rem;
    font-weight: bold;
  }

  .score-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .progress-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .progress-label {
    color: #ccc;
    font-size: 0.9rem;
    font-weight: 500;
  }
  
  .progress-value {
    color: #fff;
    font-size: 1rem;
    font-weight: bold;
    background: rgba(0, 136, 255, 0.2);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: 1px solid rgba(0, 136, 255, 0.3);
  }

  .score-label {
    color: #ccc;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .score-value {
    color: #fff;
    font-size: 1.2rem;
    font-weight: bold;
    background: rgba(0, 255, 136, 0.2);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: 1px solid rgba(0, 255, 136, 0.3);
  }

  .target-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .target-label {
    color: #ccc;
    font-size: 0.8rem;
  }

  .target-type {
    font-size: 0.9rem;
    font-weight: bold;
    text-transform: uppercase;
  }

  /* Score Breakdown Chart Styles */
  .score-breakdown {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
  }

  .breakdown-title {
    color: #ccc;
    font-size: 0.8rem;
    font-weight: 500;
    margin-bottom: 0.75rem;
  }

  .chart-item {
    margin-bottom: 0.5rem;
  }

  .chart-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
    color: #fff;
  }

  .chart-icon {
    font-size: 0.9rem;
  }

  .chart-bar {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
  }

  .chart-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
    min-width: 2px;
  }

  @media (max-width: 768px) {
    .toggle-group {
      flex-direction: column;
      align-items: center;
    }
    
    .toggle-btn .btn-content {
      min-width: 120px;
      justify-content: center;
    }

    .game-score {
      margin-top: 0.5rem;
      padding: 0.75rem;
    }

    .score-display {
      margin-bottom: 0.25rem;
    }
  }

  /* Status Indicator Styles */
  .status-indicator {
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.2);
    text-align: center;
  }

  .status-loading {
    color: #ffa500;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .status-active {
    color: #00ff00;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .status-failed {
    color: #ff4444;
    font-size: 0.9rem;
    font-weight: 500;
  }

  /* Participant Section Styles */
  .participant-section {
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .participant-label {
    display: block;
    color: #ccc;
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .participant-input-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .participant-input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-size: 0.9rem;
    box-sizing: border-box;
  }

  .qr-scan-btn {
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(0, 255, 136, 0.5);
    border-radius: 4px;
    background: rgba(0, 255, 136, 0.1);
    color: #00ff88;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .qr-scan-btn:hover:not(:disabled) {
    background: rgba(0, 255, 136, 0.2);
    border-color: rgba(0, 255, 136, 0.7);
    transform: translateY(-1px);
  }

  .qr-scan-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #666;
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
  }

  .participant-input:focus {
    outline: none;
    border-color: #00ff88;
    background: rgba(255, 255, 255, 0.15);
  }

  .participant-input::placeholder {
    color: #888;
  }


  .participant-info {
    margin-top: 0.5rem;
    color: #00ff88;
    font-size: 0.8rem;
    text-align: center;
    font-weight: 500;
  }
</style>