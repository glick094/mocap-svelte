<script>
  import { onMount } from 'svelte';
  import ThreeJSCanvas from '$lib/ThreeJSCanvas.svelte';
  import WebcamPose from '$lib/WebcamPose.svelte';
  import SettingsModal from '$lib/SettingsModal.svelte';

  // App state
  let showSettings = false;
  let isWebcamActive = true; // Start with webcam active
  let canvasSettings = {
    width: window.innerWidth || 1920,
    height: window.innerHeight - 80 || 1000, // Subtract header height
    frameColor: '#333'
  };

  // Settings data
  let userSettings = {
    username: '',
    theme: 'dark',
    quality: 'high',
    enableAudio: true,
    fps: 15
  };

  // WebcamPose dimensions
  let webcamWidth = 300;
  let webcamHeight = 225;
  
  // Pose data for 3D visualization
  let currentPoseData = null;
  let poseHistory = [];
  const maxPoseHistory = 60; // Keep last 60 frames for smoothing

  function openSettings() {
    showSettings = true;
  }

  function closeSettings() {
    showSettings = false;
  }

  function saveSettings(event) {
    const { userSettings: newUserSettings, canvasSettings: newCanvasSettings } = event.detail;
    userSettings = { ...userSettings, ...newUserSettings };
    if (newCanvasSettings) {
      canvasSettings = { ...canvasSettings, ...newCanvasSettings };
    }
    closeSettings();
    // Save to localStorage
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    localStorage.setItem('canvasSettings', JSON.stringify(canvasSettings));
    console.log('Settings saved:', { userSettings, canvasSettings });
  }

  function toggleWebcam() {
    isWebcamActive = !isWebcamActive;
  }

  function handleCanvasUpdate(event) {
    // Handle updates from the 3D canvas
    console.log('Canvas update:', event.detail);
  }
  
  function handlePoseUpdate(event) {
    // Receive pose data from WebcamPose component
    currentPoseData = event.detail;
    
    // Add to history for smoothing
    if (currentPoseData) {
      poseHistory.push(currentPoseData);
      if (poseHistory.length > maxPoseHistory) {
        poseHistory.shift();
      }
    }
  }

  function updateCanvasSize() {
    const sidePanelWidth = window.innerWidth > 768 ? 350 : 0; // Hide side panel on mobile
    canvasSettings.width = window.innerWidth - sidePanelWidth;
    canvasSettings.height = window.innerHeight - 80; // Subtract header height
  }

  onMount(() => {
    // Load saved settings on app start
    const savedUserSettings = localStorage.getItem('userSettings');
    if (savedUserSettings) {
      try {
        userSettings = JSON.parse(savedUserSettings);
      } catch (e) {
        console.error('Error loading saved user settings:', e);
      }
    }

    const savedCanvasSettings = localStorage.getItem('canvasSettings');
    if (savedCanvasSettings) {
      try {
        const saved = JSON.parse(savedCanvasSettings);
        canvasSettings = { ...canvasSettings, ...saved };
      } catch (e) {
        console.error('Error loading saved canvas settings:', e);
      }
    }
    
    // Update canvas size on mount and window resize
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  });
</script>

<svelte:head>
  <title>Motion Capture Studio</title>
  <meta name="description" content="Interactive 3D motion capture with webcam and MediaPipe pose tracking" />
</svelte:head>

<div class="app-container">
  <!-- Header -->
  <header class="app-header">
    <h1>Motion Capture Studio</h1>
    <div class="header-buttons">
      <button class="header-btn" class:active={isWebcamActive} on:click={toggleWebcam}>
        {isWebcamActive ? '📹 Stop Camera' : '📷 Start Camera'}
      </button>
      <button class="header-btn game-btn">
        🎮 Start Game
      </button>
      <button class="header-btn settings-btn" on:click={openSettings}>
        ⚙️ Settings
      </button>
    </div>
  </header>

  <!-- Main Content Area -->
  <main class="main-content">
    <!-- Fullscreen Canvas -->
    <section class="canvas-section">
      <ThreeJSCanvas 
        width={canvasSettings.width}
        height={canvasSettings.height}
        frameColor={canvasSettings.frameColor}
        poseData={currentPoseData}
        on:update={handleCanvasUpdate}
      />
    </section>

    <!-- Side Panel -->
    <aside class="side-panel">
      <!-- Webcam Feed -->
      <section class="webcam-section">
        {#if isWebcamActive}
          <WebcamPose 
            width={webcamWidth}
            height={webcamHeight}
            on:poseUpdate={handlePoseUpdate}
          />
        {:else}
          <div class="webcam-inactive">
            <div class="camera-icon">📷</div>
            <p>Camera Inactive</p>
            <small>Use the camera button in the header to start</small>
          </div>
        {/if}
      </section>
    </aside>
  </main>

  <!-- Settings Modal/Popup -->
  {#if showSettings}
    <SettingsModal 
      {userSettings}
      {canvasSettings}
      on:close={closeSettings}
      on:save={saveSettings}
    />
  {/if}
</div>

<style>
  .app-container {
    min-height: 100vh;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    color: white;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    height: 80px;
    box-sizing: border-box;
  }

  .app-header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    background: linear-gradient(45deg, #00ff88, #00ccff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .header-buttons {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .header-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.9rem;
  }

  .header-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .header-btn.active {
    background: rgba(0, 255, 136, 0.2);
    border-color: rgba(0, 255, 136, 0.5);
    color: #00ff88;
  }

  .game-btn {
    background: rgba(255, 136, 0, 0.2);
    border-color: rgba(255, 136, 0, 0.5);
    color: #ff8800;
  }

  .game-btn:hover {
    background: rgba(255, 136, 0, 0.3);
  }

  .main-content {
    display: grid;
    grid-template-columns: 1fr 350px;
    gap: 0;
    padding-top: 80px; /* Account for fixed header */
    min-height: calc(100vh - 80px);
    overflow: hidden;
  }

  .canvas-section {
    position: relative;
    background: #000;
  }

  .side-panel {
    background: rgba(0, 0, 0, 0.3);
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
  }

  .webcam-section {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .webcam-inactive {
    text-align: center;
    color: #888;
    padding: 2rem;
  }

  .camera-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .webcam-inactive p {
    margin: 0.5rem 0;
    font-weight: 500;
    font-size: 1.1rem;
  }

  .webcam-inactive small {
    font-size: 0.9rem;
    opacity: 0.7;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .app-header {
      padding: 0.5rem 1rem;
    }

    .app-header h1 {
      font-size: 1.2rem;
    }

    .header-buttons {
      gap: 0.5rem;
    }

    .header-btn {
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
    }

    .main-content {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }

    .side-panel {
      border-left: none;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      max-height: 300px;
    }

    .webcam-section {
      padding: 0.5rem;
    }
  }
</style>