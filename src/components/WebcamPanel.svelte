<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // Type definitions
  interface Settings {
    [key: string]: any;
  }

  export let active: boolean = false;
  export let settings: Settings = {};
  export let fps: number = 15;

  let videoElement: HTMLVideoElement; // Hidden video for capture
  let displayCanvas: HTMLCanvasElement; // Main display canvas
  let videoContainer: HTMLDivElement;
  let stream: MediaStream | null = null;
  let error: string | null = null;
  let holistic: any = null;
  let isMediaPipeLoaded: boolean = false;

  // Processing state
  let currentResults: any = null;
  let frameCount: number = 0;
  let isRunning: boolean = false;
  let animationId: number | null = null;

  onMount(async () => {
    await loadMediaPipe();
  });

  onDestroy(() => {
    cleanup();
  });

  $: if (active && isMediaPipeLoaded) {
    startWebcam();
  } else if (!active) {
    stopWebcam();
  }

  function cleanup() {
    stopWebcam();
    if (holistic) {
      holistic.close();
      holistic = null;
    }
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  async function loadMediaPipe() {
    try {
      const { Holistic } = await import('@mediapipe/holistic');
      const { drawConnectors, drawLandmarks } = await import('@mediapipe/drawing_utils');
      
      window.mpDrawing = { drawConnectors, drawLandmarks };

      holistic = new Holistic({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
      });

      holistic.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        refineFaceLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      holistic.onResults(onResults);
      isMediaPipeLoaded = true;
      console.log('MediaPipe Holistic loaded successfully');
    } catch (err: any) {
      error = `MediaPipe loading error: ${err.message}`;
      console.error('MediaPipe error:', err);
    }
  }

  function onResults(results: any): void {
    currentResults = results;
    frameCount++;
  }

  function setupCanvas() {
    if (!displayCanvas || !videoContainer) return;
    
    const containerRect = videoContainer.getBoundingClientRect();
    const width = Math.max(containerRect.width || 640, 320);
    const height = Math.max(containerRect.height || 480, 240);

    displayCanvas.width = width;
    displayCanvas.height = height;
    
    console.log(`Canvas setup: ${width} x ${height}`);
  }

  async function startWebcam() {
    try {
      error = null;
      
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: 'user'
        },
        audio: settings?.enableAudio || false
      });
      
      if (videoElement) {
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
          console.log('Video loaded, setting up canvas...');
          setupCanvas();
        };
        
        videoElement.onplay = () => {
          console.log('Video playing, starting frame processing...');
          isRunning = true;
          processFrameLoop();
        };
      }
    } catch (err: any) {
      error = err.message;
      console.error('Webcam error:', err);
    }
  }

  function processFrameLoop() {
    if (!isRunning || !active || !displayCanvas || !videoElement) {
      return;
    }

    // Draw current video frame to canvas
    drawVideoFrame();
    
    // Process with MediaPipe at specified FPS
    const now = Date.now();
    const frameInterval = 1000 / fps;
    
    if (!window.lastMPProcess || (now - window.lastMPProcess > frameInterval)) {
      window.lastMPProcess = now;
      
      if (holistic && videoElement.videoWidth > 0) {
        holistic.send({ image: videoElement }).catch(console.error);
      }
    }
    
    // Draw landmarks if we have results
    if (currentResults) {
      drawLandmarks();
    }
    
    // Continue loop
    animationId = requestAnimationFrame(processFrameLoop);
  }

  function drawVideoFrame(): void {
    if (!displayCanvas || !videoElement) return;
    
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;
    const canvas = displayCanvas;
    
    // Ensure canvas matches video aspect ratio
    if (videoElement.videoWidth && videoElement.videoHeight) {
      const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
      const canvasAspect = canvas.width / canvas.height;
      
      let drawWidth = canvas.width;
      let drawHeight = canvas.height;
      let offsetX = 0;
      let offsetY = 0;
      
      if (videoAspect > canvasAspect) {
        // Video is wider
        drawHeight = canvas.width / videoAspect;
        offsetY = (canvas.height - drawHeight) / 2;
      } else {
        // Video is taller
        drawWidth = canvas.height * videoAspect;
        offsetX = (canvas.width - drawWidth) / 2;
      }
      
      // Clear and draw video frame
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(videoElement, offsetX, offsetY, drawWidth, drawHeight);
    }
  }

  function drawLandmarks(): void {
    if (!displayCanvas || !currentResults) return;
    
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;
    const { drawConnectors, drawLandmarks } = (window as any).mpDrawing || {};

    // Draw frame counter and debug info
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(10, 10, 20, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px Arial';
    ctx.fillText(`F:${frameCount}`, 40, 25);
    
    // Debug: Show if we have pose data
    if (currentResults.poseLandmarks) {
      ctx.fillStyle = '#00FF88';
      ctx.fillText(`Pose: ${currentResults.poseLandmarks.length}`, 40, 45);
    } else {
      ctx.fillStyle = '#FF4444';
      ctx.fillText('No Pose', 40, 45);
    }
    
    // Debug: Show if we have drawing functions
    if (!drawConnectors || !drawLandmarks) {
      ctx.fillStyle = '#FF4444';
      ctx.fillText('No Draw Utils', 40, 65);
      return;
    }

    // Set drawing style
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw pose landmarks immediately without async import
    if (currentResults.poseLandmarks && currentResults.poseLandmarks.length > 0) {
      console.log('Drawing pose landmarks:', currentResults.poseLandmarks.length);
      
      // Draw simple circles first to test coordinate system
      currentResults.poseLandmarks.forEach((landmark: any, index: number) => {
        const x = landmark.x * displayCanvas.width;
        const y = landmark.y * displayCanvas.height;
        
        ctx.fillStyle = '#FF0040';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw landmark number for first few points
        if (index < 5) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '10px Arial';
          ctx.fillText(index.toString(), x + 6, y + 6);
        }
      });
      
      // Try MediaPipe drawing functions with error handling
      try {
        // Use hardcoded connections for now
        const POSE_CONNECTIONS = [
          [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Arms
          [11, 23], [12, 24], [23, 24], // Torso
          [23, 25], [25, 27], [24, 26], [26, 28] // Legs
        ];
        
        // Draw connections
        ctx.strokeStyle = '#00FF88';
        ctx.lineWidth = 3;
        POSE_CONNECTIONS.forEach(([start, end]) => {
          if (start < currentResults.poseLandmarks.length && end < currentResults.poseLandmarks.length) {
            const startPoint = currentResults.poseLandmarks[start];
            const endPoint = currentResults.poseLandmarks[end];
            
            const x1 = startPoint.x * displayCanvas.width;
            const y1 = startPoint.y * displayCanvas.height;
            const x2 = endPoint.x * displayCanvas.width;
            const y2 = endPoint.y * displayCanvas.height;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        });
      } catch (err) {
        console.error('Error drawing pose connections:', err);
      }
    }

    // Draw hand landmarks
    if (currentResults.leftHandLandmarks) {
      ctx.fillStyle = '#00CCFF';
      currentResults.leftHandLandmarks.forEach((landmark: any) => {
        const x = landmark.x * displayCanvas.width;
        const y = landmark.y * displayCanvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    if (currentResults.rightHandLandmarks) {
      ctx.fillStyle = '#FFCC00';
      currentResults.rightHandLandmarks.forEach((landmark: any) => {
        const x = landmark.x * displayCanvas.width;
        const y = landmark.y * displayCanvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }

  function stopWebcam() {
    isRunning = false;
    
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    
    if (videoElement) {
      videoElement.srcObject = null;
    }

    if (displayCanvas) {
      const ctx = displayCanvas.getContext('2d');
      ctx!.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    }
    
    currentResults = null;
    frameCount = 0;
  }

  function handleResize() {
    if (displayCanvas && videoContainer) {
      setupCanvas();
    }
  }
</script>

<svelte:window on:resize={handleResize} />

<div class="webcam-panel">
  <div class="panel-header">
    <h3>📹 Webcam + MediaPipe (Synchronized)</h3>
    <div class="status-indicators">
      <div class="status-indicator" class:active class:error={!!error}>
        {active ? (error ? '⚠️' : '🟢') : '⚫'}
      </div>
      <div class="mediapipe-indicator" class:loaded={isMediaPipeLoaded}>
        {isMediaPipeLoaded ? '🧠' : '⏳'}
      </div>
      <div class="processing-indicator" class:running={isRunning}>
        {isRunning ? '▶️' : '⏸️'}
      </div>
    </div>
  </div>

  <div class="video-container" bind:this={videoContainer}>
    {#if active && !error}
      <div class="display-wrapper">
        <!-- Hidden video element for capture -->
        <video 
          bind:this={videoElement}
          autoplay
          muted
          playsinline
          class="hidden-video"
        ></video>
        
        <!-- Main display canvas -->
        <canvas 
          bind:this={displayCanvas}
          class="display-canvas"
        ></canvas>
        
        <div class="video-overlay">
          <div class="recording-indicator">
            <span class="pulse"></span>
            SYNCHRONIZED
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
        <p>Synchronized Camera + AI</p>
        <small>Click to activate synchronized webcam with pose detection</small>
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
      <span>Processing:</span>
      <span class:running={isRunning}>
        {isRunning ? 'Running' : 'Stopped'}
      </span>
    </div>
    <div class="info-row">
      <span>FPS Target:</span>
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

  .status-indicator, .mediapipe-indicator, .processing-indicator {
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

  .processing-indicator.running {
    background: #ffcc00;
    box-shadow: 0 0 10px rgba(255, 204, 0, 0.5);
    animation: pulse 1s infinite;
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

  .display-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hidden-video {
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .display-canvas {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }

  .video-overlay {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 20;
  }

  .recording-indicator {
    background: rgba(255, 204, 0, 0.9);
    color: black;
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
    background: black;
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

  .info-row span.active, .info-row span.running {
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