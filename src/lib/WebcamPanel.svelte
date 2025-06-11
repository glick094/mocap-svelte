<script>
  import { onMount, onDestroy } from 'svelte';

  export let active = false;
  export let settings = {};

  let videoElement;
  let stream = null;
  let error = null;

  onMount(() => {
    if (active) {
      startWebcam();
    }
  });

  onDestroy(() => {
    stopWebcam();
  });

  $: if (active) {
    startWebcam();
  } else {
    stopWebcam();
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
      }
    } catch (err) {
      error = err.message;
      console.error('Webcam error:', err);
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
  }
</script>

<div class="webcam-panel">
  <div class="panel-header">
    <h3>📹 Webcam Feed</h3>
    <div class="status-indicator" class:active class:error={!!error}>
      {active ? (error ? '⚠️' : '🟢') : '⚫'}
    </div>
  </div>

  <div class="video-container">
    {#if active && !error}
      <!-- svelte-ignore a11y-media-has-caption -->
      <video 
        bind:this={videoElement}
        autoplay
        muted
        playsinline
        class="webcam-video"
      />
      <div class="video-overlay">
        <div class="recording-indicator">
          <span class="pulse"></span>
          LIVE
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
        <p>Camera Inactive</p>
        <small>Click to activate webcam</small>
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
      <span>Resolution:</span>
      <span>320×240</span>
    </div>
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

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #666;
    transition: all 0.3s ease;
  }

  .status-indicator.active {
    background: #00ff88;
    box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
  }

  .status-indicator.error {
    background: #ff4444;
    box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
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

  .webcam-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .video-overlay {
    position: absolute;
    top: 8px;
    right: 8px;
  }

  .recording-indicator {
    background: rgba(255, 0, 0, 0.8);
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
    font-size: 0.8rem;
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
</style>