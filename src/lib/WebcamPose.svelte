<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();

  export let width = 640;
  export let height = 480;
  export let gameActive = false;
  export let gameScore = 0;
  export let currentTargetType = null;
  export let scoreBreakdown = { hand: 0, head: 0, knee: 0 };

  let videoElement;
  let canvasElement;
  let canvasCtx;
  let stream;
  let isLoading = true;
  let error = null;
  let mounted = false;
  let retryCount = 0;
  let maxRetries = 3;
  let initializationInProgress = false;
  let mediaPipeInitInProgress = false;

  // MediaPipe variables
  let holistic = null;
  let camera = null;
  let poseTrackingActive = false;
  let mediaPipeReady = false;

  // Toggle controls
  let showPose = true;
  let showHands = true;
  let showFace = true;

  // Pose tracking results
  let currentResults = null;

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

  function drawLandmarks(ctx, landmarks, color = '#FF0000', radius = 3) {
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

  function drawConnections(ctx, landmarks, connections, color = '#00FF00', lineWidth = 2) {
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

  function drawStatusOverlay() {
    if (!mediaPipeReady) {
      // Show loading status
      canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      canvasCtx.fillRect(10, 10, 250, 60);
      
      canvasCtx.fillStyle = 'white';
      canvasCtx.font = '14px Arial';
      canvasCtx.fillText('MediaPipe: Loading...', 15, 30);
      canvasCtx.font = '12px Arial';
      canvasCtx.fillText('Installing from npm packages', 15, 50);
    } else if (poseTrackingActive) {
      // Show active status (smaller overlay)
      canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      canvasCtx.fillRect(10, 10, 180, 30);
      
      canvasCtx.fillStyle = '#00FF00';
      canvasCtx.font = '12px Arial';
      canvasCtx.fillText('✓ MediaPipe Active', 15, 28);
    }
  }

  function onPoseResults(results) {
    currentResults = results;
    
    // Emit pose data for 3D visualization
    if (results.poseLandmarks || results.leftHandLandmarks || results.rightHandLandmarks || results.faceLandmarks) {
      dispatch('poseUpdate', {
        poseLandmarks: results.poseLandmarks,
        leftHandLandmarks: results.leftHandLandmarks,
        rightHandLandmarks: results.rightHandLandmarks,
        faceLandmarks: results.faceLandmarks,
        timestamp: Date.now()
      });
      
      // Debug logging
      console.log('MediaPipe results received:', {
        pose: !!results.poseLandmarks,
        leftHand: !!results.leftHandLandmarks,
        rightHand: !!results.rightHandLandmarks,
        face: !!results.faceLandmarks
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
      
      // Draw pose landmarks based on toggle states
      if (showPose && results.poseLandmarks) {
        drawConnections(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, '#00FF00', 2);
        drawLandmarks(canvasCtx, results.poseLandmarks, '#00FF00', 4);
      }
      
      if (showHands) {
        if (results.leftHandLandmarks) {
          drawConnections(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, '#FF0000', 2);
          drawLandmarks(canvasCtx, results.leftHandLandmarks, '#FF0000', 3);
        }
        if (results.rightHandLandmarks) {
          drawConnections(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, '#0000FF', 2);
          drawLandmarks(canvasCtx, results.rightHandLandmarks, '#0000FF', 3);
        }
      }
      
      if (showFace && results.faceLandmarks) {
        drawConnections(canvasCtx, results.faceLandmarks, FACE_OVAL_CONNECTIONS, '#FFFF00', 1);
        drawLandmarks(canvasCtx, results.faceLandmarks, '#FFFF00', 1);
      }
      
      // Show status overlay
      drawStatusOverlay();
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
    
    const tryInitializeWithCdn = async (cdnUrl) => {
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
                if (sendErr && sendErr.message && sendErr.message.includes('NetworkError')) {
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
      dispatch('streamReady', { stream });

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
          
          // Show status overlay
          drawStatusOverlay();
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
        error = err.message;
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

  function getTargetColor(targetType) {
    const colors = {
      'hand': '#ff0000',
      'head': '#00ff88', 
      'knee': '#0000ff'
    };
    return colors[targetType] || '#ffffff';
  }

  function getBarWidth(score) {
    if (gameScore === 0) return 0;
    return Math.max((score / gameScore) * 100, 0);
  }

  onDestroy(() => {
    console.log('Component destroying');
    
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
          <div class="score-display">
            <span class="score-label">Total Score:</span>
            <span class="score-value">{gameScore}</span>
          </div>
          
          {#if currentTargetType}
            <div class="target-info">
              <span class="target-label">Current Target:</span>
              <span class="target-type" style="color: {getTargetColor(currentTargetType)}">
                {currentTargetType.toUpperCase()}
              </span>
            </div>
          {/if}
          
          <!-- Score Breakdown Bar Chart -->
          <div class="score-breakdown">
            <div class="breakdown-title">Score Breakdown:</div>
            
            <div class="chart-item">
              <div class="chart-label">
                <span class="chart-icon" style="color: #ff0000;">✋</span>
                <span>Hands: {scoreBreakdown.hand}</span>
              </div>
              <div class="chart-bar">
                <div 
                  class="chart-fill" 
                  style="width: {getBarWidth(scoreBreakdown.hand)}%; background-color: #ff0000;"
                ></div>
              </div>
            </div>
            
            <div class="chart-item">
              <div class="chart-label">
                <span class="chart-icon" style="color: #00ff88;">😀</span>
                <span>Head: {scoreBreakdown.head}</span>
              </div>
              <div class="chart-bar">
                <div 
                  class="chart-fill" 
                  style="width: {getBarWidth(scoreBreakdown.head)}%; background-color: #00ff88;"
                ></div>
              </div>
            </div>
            
            <div class="chart-item">
              <div class="chart-label">
                <span class="chart-icon" style="color: #0000ff;">🦵</span>
                <span>Knees: {scoreBreakdown.knee}</span>
              </div>
              <div class="chart-bar">
                <div 
                  class="chart-fill" 
                  style="width: {getBarWidth(scoreBreakdown.knee)}%; background-color: #0000ff;"
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

  h3 {
    margin: 0 0 1rem 0;
    color: #fff;
    font-size: 1.2rem;
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

  .score-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
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
</style>