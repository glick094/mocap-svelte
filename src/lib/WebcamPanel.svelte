<script>
  import { onMount, onDestroy } from 'svelte';

  export let active = false;
  export let settings = {};

  let videoElement;
  let canvasElement;
  let stream = null;
  let error = null;
  let holistic = null;
  let camera = null;
  let isMediaPipeLoaded = false;

  // MediaPipe results
  let currentResults = null;

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
      const { Camera } = await import('@mediapipe/camera_utils');
      const { drawConnectors, drawLandmarks } = await import('@mediapipe/drawing_utils');
      
      // Store drawing utils globally for use in other functions
      window.mpDrawing = { drawConnectors, drawLandmarks };

      // Initialize Holistic
      holistic = new Holistic({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
      });

      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: true,
        refineFaceLandmarks: true,
        minDetectionConfidence: 0.5,
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
    drawResults(results);
  }

  function drawResults(results) {
    if (!canvasElement || !videoElement) return;

    const ctx = canvasElement.getContext('2d');
    const { drawConnectors, drawLandmarks } = window.mpDrawing;

    // Clear canvas
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Set up drawing styles
    ctx.globalCompositeOperation = 'source-over';

    // Import pose connections
    import('@mediapipe/holistic').then(({ POSE_CONNECTIONS, HAND_CONNECTIONS, FACEMESH_TESSELATION }) => {
      // Draw pose landmarks
      if (results.poseLandmarks) {
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: '#00FF88',
          lineWidth: 2
        });
        drawLandmarks(ctx, results.poseLandmarks, {
          color: '#FF0040',
          radius: 3
        });
      }

      // Draw left hand landmarks
      if (results.leftHandLandmarks) {
        drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, {
          color: '#00CCFF',
          lineWidth: 2
        });
        drawLandmarks(ctx, results.leftHandLandmarks, {
          color: '#FF0040',
          radius: 2
        });
      }

      // Draw right hand landmarks
      if (results.rightHandLandmarks) {
        drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, {
          color: '#00CCFF',
          lineWidth: 2
        });
        drawLandmarks(ctx, results.rightHandLandmarks, {
          color: '#FF0040',
          radius: 2
        });
      }

      // Draw face landmarks (simplified)
      if (results.faceLandmarks) {
        drawLandmarks(ctx, results.faceLandmarks, {
          color: '#FFFF00',
          radius: 1
        });
      }
    });
  }

  async function startWebcam() {
    try {
      error = null;
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 320, 
          height: 240,
          facingMode: 'user'
        },
        audio: settings.enableAudio || false
      });
      
      if (videoElement) {
        videoElement.srcObject = stream;
        
        // Wait for video to load
        videoElement.onloadedmetadata = () => {
          // Set canvas dimensions to match video
          if (canvasElement) {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
          }

          // Start MediaPipe camera if holistic is loaded
          if (holistic && isMediaPipeLoaded) {
            const { Camera } = window.mpCamera || {};
            if (Camera) {
              camera = new Camera(videoElement, {
                onFrame: async () => {
                  if (holistic) {
                    await holistic.send({ image: videoElement });
                  }
                },
                width: 320,
                height: 240
              });
              camera.start();
            } else {
              // Fallback: manually process frames
              processFrames();
            }
          }
        };
      }
    } catch (err) {
      error = err.message;
      console.error('Webcam error:', err);
    }
  }

  // Fallback frame processing
  function processFrames() {
    if (!active || !holistic || !videoElement) return;
    
    holistic.send({ image: videoElement }).then(() => {
      if (active) {
        requestAnimationFrame(processFrames);
      }
    });
  }

  function stopWebcam() {
    if (camera) {
      camera.stop();
      camera = null;
    }
    
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
  }

  // Store Camera class globally when imported
  onMount(async () => {
    try {
      const { Camera } = await import('@mediapipe/camera_utils');
      window.mpCamera = { Camera };
    } catch (err) {
      console.log('Camera utils not available, using fallback');
    }
  });
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
        />
        <canvas 
          bind:this={canvasElement}
          class="landmark-overlay"
        />
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
      <span>Resolution:</span>
      <span>320×240</span>
    </div>
    {#if currentResults}
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
  }

  .webcam-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .landmark-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .video-overlay {
    position: absolute;
    top: 8px;
    right: 8px;
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