<script>
  import { onMount } from 'svelte';
  import ThreeJSCanvas from '$lib/ThreeJSCanvas.svelte';
  import WebcamPose from '$lib/WebcamPose.svelte';
  import ControlPanel from '$lib/ControlPanel.svelte';
  import SettingsModal from '$lib/SettingsModal.svelte';

  // App state
  let showSettings = false;
  let isWebcamActive = true; // Start with webcam active
  let canvasSettings = {
    width: 800,
    height: 600,
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
  let webcamWidth = 640;
  let webcamHeight = 480;
  
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

  function saveSettings(newSettings) {
    userSettings = { ...userSettings, ...newSettings };
    closeSettings();
    // Save to localStorage
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    console.log('Settings saved:', userSettings);
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

  onMount(() => {
    // Load saved settings on app start
    const saved = localStorage.getItem('userSettings');
    if (saved) {
      try {
        userSettings = JSON.parse(saved);
      } catch (e) {
        console.error('Error loading saved settings:', e);
      }
    }
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
    <button class="settings-btn" on:click={openSettings}>
      ⚙️ Settings
    </button>
  </header>

  <!-- Main Content Area -->
  <main class="main-content">
    <!-- Primary 3D Canvas -->
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
      <!-- Webcam Feed with MediaPipe -->
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
            <small>Enable camera to start pose tracking</small>
          </div>
        {/if}
      </section>

      <!-- Controls -->
      <section class="controls-section">
        <ControlPanel 
          {userSettings}
          on:toggleWebcam={toggleWebcam}
          on:openSettings={openSettings}
          bind:canvasSettings
        />
      </section>
    </aside>
  </main>

  <!-- Settings Modal/Popup -->
  {#if showSettings}
    <SettingsModal 
      {userSettings}
      on:close={closeSettings}
      on:save={(e) => saveSettings(e.detail)}
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

  .settings-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.9rem;
  }

  .settings-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .main-content {
    display: grid;
    grid-template-columns: 1fr 350px;
    gap: 2rem;
    padding: 2rem;
    min-height: calc(100vh - 80px);
  }

  .canvas-section {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .side-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .webcam-section,
  .controls-section {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    padding: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .webcam-section {
    flex: 1;
    min-height: 350px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .controls-section {
    flex: 0 0 auto;
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
  @media (max-width: 1024px) {
    .main-content {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto;
    }

    .side-panel {
      flex-direction: row;
      gap: 1rem;
    }

    .webcam-section,
    .controls-section {
      flex: 1;
    }

    .webcam-section {
      min-height: 250px;
    }
  }

  @media (max-width: 768px) {
    .app-header {
      padding: 1rem;
    }

    .app-header h1 {
      font-size: 1.2rem;
    }

    .main-content {
      padding: 1rem;
      gap: 1rem;
      grid-template-columns: 1fr;
    }

    .side-panel {
      flex-direction: column;
    }

    .webcam-section {
      min-height: 300px;
    }
  }
</style>