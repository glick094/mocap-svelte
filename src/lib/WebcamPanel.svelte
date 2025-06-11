<script>
  import { onMount, onDestroy } from 'svelte';

  export let active = false;
  export let settings = {};
  export let fps = 15;

  let videoElement;
  let canvasElement;
  let stream = null;
  let error = null;
  let holistic = null;
  let isMediaPipeLoaded = false;

  // MediaPipe results
  let currentResults = null;
  let isProcessing = false;
  let frameCount = 0;
  let lastProcessTime = 0;

  onMount(async () => {
    await loadMediaPipe();
    if (active) {
      startWebcam();
    }
  });

  onDestroy(() => {
    stopWebcam();
    if (holistic) {
      holistic.close();
    }
  });

  $: if (active && isMediaPipeLoaded) {
    startWebcam();
  } else if (!active) {
    stopWebcam();
  }

  async function loadMediaPipe() {
    try {
      // Import MediaPipe modules
      const { Holistic } = await import('@mediapipe/holistic');
      const { drawConnectors, drawLandmarks } = await import('@mediapipe/drawing_utils');
      
      // Store drawing utils globally
      window.mpDrawing = { drawConnectors, drawLandmarks };

      // Initialize Holistic with performance-optimized settings
      holistic = new Holistic({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
      });

      holistic.setOptions({
        modelComplexity: 0, // Reduced for performance
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        refineFaceLandmarks: false, // Disabled for performance
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });

      holistic.onResults(onResults);
      isMediaPipeLoaded = true;
      console.log('MediaPipe Holistic loaded successfully');
    } catch (err) {
      error = `MediaPipe loading error: ${err.message}`;
      console.error('MediaPipe error:', err);
    }
  }

  function onResults(results) {
    currentResults = results;
    frameCount++;
    drawLandmarks(results);
    isProcessing = false;
  }

  function setupCanvas() {
    if (!canvasElement || !videoElement) return;
    
    console.log('Setting up canvas - Video dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
    
    if (videoElement.videoWidth && videoElement.videoHeight) {
      // Set canvas internal resolution to match video
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      
      // Make canvas transparent
      const ctx = canvasElement.getContext('2d');
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      
      console.log('Canvas setup complete:', canvasElement.width, 'x', canvasElement.height);
    }
  }

  function drawLandmarks(results) {
    if (!canvasElement || !results) return;

    const ctx = canvasElement.getContext('2d');
    const { drawConnectors, drawLandmarks } = window.mpDrawing || {};
    
    if (!drawConnectors || !drawLandmarks) return;

    // Clear canvas but keep it transparent
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw test indicator to verify overlay is working
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(5, 5, 15, 15);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px Arial';
    ctx.fillText(`${frameCount}`, 25, 15);

    // Set drawing style
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Import connections asynchronously
    import('@mediapipe/holistic').then(({ POSE_CONNECTIONS, HAND_CONNECTIONS }) => {
      // Draw pose landmarks
      if (results.poseLandmarks && results.poseLandmarks.length > 0) {
        // Draw connections first (behind landmarks)
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: '#00FF88',
          lineWidth: 2
        });
        
        // Draw landmark points on top
        drawLandmarks(ctx, results.poseLandmarks, {
          color: '#FF0040',
          radius: 3,
          fillColor: '#FF0040'
        });
      }

      // Draw left hand
      if (results.leftHandLandmarks && results.leftHandLandmarks.length > 0) {
        drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, {
          color: '#00CCFF',
          lineWidth: 1
        });
        drawLandmarks(ctx, results.leftHandLandmarks, {
          color: '#00CCFF',
          radius: 2,
          fillColor: '#00CCFF'
        });
      }

      // Draw right hand
      if (results.rightHandLandmarks && results.rightHandLandmarks.length > 0) {
        drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, {
          color: '#FFCC00',
          lineWidth: 1
        });
        drawLandmarks(ctx, results.rightHandLandmarks, {
          color: '#FFCC00',
          radius: 2,
          fillColor: '#FFCC00'
        });
      }
    });
  }

  async function startWebcam() {
    try {
      error = null;
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          facingMode: 'user',
          frameRate: { ideal: 15, max: 30 } // Reduced for performance
        },
        audio: settings?.enableAudio || false
      });
      
      if (videoElement) {
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
          console.log('Video metadata loaded');
          setupCanvas();
        };
        
        videoElement.onplay = () => {
          console.log('Video started playing');
          setupCanvas();
          
          // Start MediaPipe processing with delay
          setTimeout(() => {
            if (holistic && isMediaPipeLoaded) {
              startMediaPipeProcessing();
            }
          }, 1000);
        };
      }
    } catch (err) {
      error = err.message;
      console.error('Webcam error:', err);
    }
  }

  function startMediaPipeProcessing() {
    if (!videoElement || !videoElement.videoWidth || !holistic) {
      console.log('Cannot start MediaPipe - video not ready');
      return;
    }
    
    console.log('Starting MediaPipe processing');
    processFrames();
  }

  function processFrames() {
    if (!active || !holistic || !videoElement || !videoElement.videoWidth) {
      return;
    }
    
    const now = Date.now();
    
    const frameInterval = 1000 / fps; // Convert FPS to milliseconds
    
    // Process at user-defined FPS rate
    if (!isProcessing && (now - lastProcessTime > frameInterval)) {
      isProcessing = true;
      lastProcessTime = now;
      
      holistic.send({ image: videoElement })
        .catch((err) => {
          console.error('MediaPipe processing error:', err);
          isProcessing = false;
        });
    }
    
    // Continue processing
    if (active) {
      requestAnimationFrame(processFrames);
    }
  }

  function stopWebcam() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    
    if (videoElement) {
      videoElement.srcObject = null;
    }

    if (canvasElement) {
      const ctx = canvasElement.getContext('2d');
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
    
    currentResults = null;
    frameCount = 0;
  }
</script>

<div class="webcam-panel">
  <div class="panel-header">
    <h3>📹 Webcam + MediaPipe</h3>
    <div class="status-indicators">
      <div class="status-indicator" class:active class:error={!!error}>
        {active ? (error ? '⚠️' : '🟢') : '⚫'}
      </div>
      <div class="mediapipe-indicator" class:loaded={isMediaPipeLoaded}>
        {isMediaPipeLoaded ? '🧠' : '⏳'}
      </div>
    </div>
  </div>

  <div class="video-container">
    {#if active && !error}
      <div class="video-wrapper">
        <!-- svelte-ignore a11y-media-has-caption -->
        <video 
          bind:this={videoElement}
          autoplay
          muted
          playsinline
          class="webcam-video"
        ></video>
        <!-- Transparent overlay canvas -->
        <canvas 
          bind:this={canvasElement}
          class="landmark-overlay"
        ></canvas>
        <div class="video-overlay">
          <div class="recording-indicator">
            <span class="pulse"></span>
            LIVE + AI
          </div>
        </div>
      </div>
    {:else if error}
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <p>Camera Error</p>
        <small>{error}</small>
      </div>
    {:else}
      <div class="inactive-state">
        <div class="camera-icon">📷</div>
        <p>Camera + AI Inactive</p>
        <small>Click to activate webcam with pose detection</small>
      </div>
    {/if}
  </div>

  <div class="panel-info">
    <div class="info-row">
      <span>Status:</span>
      <span class:active class:error={!!error}>
        {active ? (error ? 'Error' : 'Active') : 'Inactive'}
      </span>
    </div>
    <div class="info-row">
      <span>MediaPipe:</span>
      <span class:loaded={isMediaPipeLoaded}>
        {isMediaPipeLoaded ? 'Loaded' : 'Loading...'}
      </span>
    </div>
    <div class="info-row">
      <span>FPS:</span>
      <span>{fps}</span>
    </div>
    {#if currentResults}
      <div class="info-row">
        <span>Frames:</span>
        <span>{frameCount}</span>
      </div>
      <div class="info-row">
        <span>Pose:</span>
        <span class:detected={currentResults.poseLandmarks}>
          {currentResults.poseLandmarks ? 'Detected' : 'None'}
        </span>
      </div>
      <div class="info-row">
        <span>Hands:</span>
        <span class:detected={currentResults.leftHandLandmarks || currentResults.rightHandLandmarks}>
          {(currentResults.leftHandLandmarks || currentResults.rightHandLandmarks) ? 'Detected' : 'None'}
        </span>
      </div>
    {/if}
  </div>
</div>

<style>
  .webcam-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #fff;
  }

  .status-indicators {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .status-indicator, .mediapipe-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #666;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
  }

  .status-indicator.active {
    background: #00ff88;
    box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
  }

  .status-indicator.error {
    background: #ff4444;
    box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
  }

  .mediapipe-indicator.loaded {
    background: #00ccff;
    box-shadow: 0 0 10px rgba(0, 204, 255, 0.5);
  }

  .video-container {
    flex: 1;
    position: relative;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
    min-height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .video-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .webcam-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #000;
  }

  .landmark-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
    /* Ensure transparency */
    background: transparent;
  }

  .video-overlay {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 20;
  }

  .recording-indicator {
    background: rgba(0, 255, 136, 0.8);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .pulse {
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 50%;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .inactive-state,
  .error-state {
    text-align: center;
    color: #888;
  }

  .camera-icon,
  .error-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .error-state {
    color: #ff4444;
  }

  .inactive-state p,
  .error-state p {
    margin: 0.5rem 0;
    font-weight: 500;
  }

  .inactive-state small,
  .error-state small {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .panel-info {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.7rem;
  }

  .info-row span:first-child {
    color: #888;
  }

  .info-row span:last-child {
    color: #fff;
  }

  .info-row span.active {
    color: #00ff88;
  }

  .info-row span.error {
    color: #ff4444;
  }

  .info-row span.loaded {
    color: #00ccff;
  }

  .info-row span.detected {
    color: #00ff88;
  }
</style>