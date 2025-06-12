<script>
  import { onMount } from 'svelte';
  import WebcamPose from '$lib/WebcamPose.svelte';

  let showLandmarks = true;
  let showConnections = true;
  let isFullscreen = false;
  let containerElement;

  // Calculate responsive dimensions
  let windowWidth = 0;
  let windowHeight = 0;
  
  $: videoWidth = isFullscreen ? windowWidth : Math.min(800, windowWidth * 0.9);
  $: videoHeight = isFullscreen ? windowHeight : Math.min(600, windowHeight * 0.7);

  function toggleFullscreen() {
    if (!isFullscreen) {
      if (containerElement.requestFullscreen) {
        containerElement.requestFullscreen();
      } else if (containerElement.webkitRequestFullscreen) {
        containerElement.webkitRequestFullscreen();
      } else if (containerElement.msRequestFullscreen) {
        containerElement.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  function handleFullscreenChange() {
    isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
  }

  onMount(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  });
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<div class="page-container" class:fullscreen={isFullscreen} bind:this={containerElement}>
  <header class="header" class:hidden={isFullscreen}>
    <h1>Pose Tracking with MediaPipe</h1>
    <p>Real-time body, hand, and face landmark detection using your webcam</p>
  </header>

  <main class="main">
    <div class="pose-viewer">
      <WebcamPose 
        width={videoWidth}
        height={videoHeight}
        {showLandmarks}
        {showConnections}
      />
    </div>

    <div class="controls" class:overlay={isFullscreen}>
      <div class="control-group">
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            bind:checked={showLandmarks}
          />
          <span class="checkmark"></span>
          Show Landmarks
        </label>

        <label class="checkbox-label">
          <input 
            type="checkbox" 
            bind:checked={showConnections}
          />
          <span class="checkmark"></span>
          Show Connections
        </label>
      </div>

      <button class="fullscreen-btn" on:click={toggleFullscreen}>
        {isFullscreen ? '⚟ Exit Fullscreen' : '⛶ Enter Fullscreen'}
      </button>
    </div>
  </main>

  {#if !isFullscreen}
    <footer class="footer">
      <div class="info">
        <h3>Features</h3>
        <ul>
          <li><strong>Pose Detection:</strong> 33 body landmarks (green)</li>
          <li><strong>Hand Tracking:</strong> 21 landmarks per hand (red/blue)</li>
          <li><strong>Face Mesh:</strong> 468 facial landmarks (yellow)</li>
          <li><strong>Real-time:</strong> Smooth tracking with MediaPipe</li>
        </ul>
      </div>
      
      <div class="info">
        <h3>Controls</h3>
        <ul>
          <li>Toggle landmarks and connections visibility</li>
          <li>Enter fullscreen mode for immersive experience</li>
          <li>Automatic responsive sizing</li>
          <li>Privacy-first: all processing happens locally</li>
        </ul>
      </div>
    </footer>
  {/if}
</div>

<style>
  .page-container {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    flex-direction: column;
    padding: 1rem;
    color: white;
  }

  .page-container.fullscreen {
    padding: 0;
    background: #000;
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
    transition: opacity 0.3s ease;
  }

  .header.hidden {
    opacity: 0;
    height: 0;
    margin: 0;
    overflow: hidden;
  }

  .header h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    font-weight: 700;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  }

  .header p {
    font-size: 1.2rem;
    opacity: 0.9;
    margin: 0;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
  }

  .pose-viewer {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    padding: 1.5rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: all 0.3s ease;
  }

  .controls.overlay {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.8);
  }

  .control-group {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 1rem;
    user-select: none;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #667eea;
  }

  .fullscreen-btn {
    background: linear-gradient(45deg, #667eea, #764ba2);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.3s ease;
    font-weight: 600;
  }

  .fullscreen-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .footer {
    margin-top: 3rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    padding: 2rem 0;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
  }

  .info h3 {
    font-size: 1.3rem;
    margin-bottom: 1rem;
    color: #fff;
  }

  .info ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .info li {
    padding: 0.5rem 0;
    opacity: 0.9;
    line-height: 1.5;
  }

  .info strong {
    color: #667eea;
  }

  @media (max-width: 768px) {
    .header h1 {
      font-size: 2rem;
    }

    .control-group {
      flex-direction: column;
      gap: 1rem;
    }

    .controls.overlay {
      top: 10px;
      right: 10px;
      left: 10px;
      padding: 1rem;
    }

    .footer {
      grid-template-columns: 1fr;
    }
  }
</style>