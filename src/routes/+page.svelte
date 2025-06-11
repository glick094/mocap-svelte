<script>
  import { onMount } from 'svelte';
  import ThreeJSCanvas from '$lib/ThreeJSCanvas.svelte';
  import WebcamPanel from '$lib/WebcamPanel.svelte';
  import ControlPanel from '$lib/ControlPanel.svelte';
  import SettingsModal from '$lib/SettingsModal.svelte';

  // App state
  let showSettings = false;
  let isWebcamActive = false;
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

  function openSettings() {
    showSettings = true;
  }

  function closeSettings() {
    showSettings = false;
  }

  function saveSettings(newSettings) {
    userSettings = { ...userSettings, ...newSettings };
    closeSettings();
    // Here you could also save to localStorage or send to server
    console.log('Settings saved:', userSettings);
  }

  function toggleWebcam() {
    isWebcamActive = !isWebcamActive;
  }

  function handleCanvasUpdate(event) {
    // Handle updates from the 3D canvas
    console.log('Canvas update:', event.detail);
  }

  onMount(() => {
    // Load saved settings on app start
    const saved = localStorage.getItem('userSettings');
    if (saved) {
      userSettings = JSON.parse(saved);
    }
  });
</script>

<svelte:head>
  <title>3D Webcam App</title>
  <meta name="description" content="Interactive 3D experience with webcam integration" />
</svelte:head>

<div class="app-container">
  <!-- Header -->
  <header class="app-header">
    <h1>3D Interactive Studio</h1>
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
        on:update={handleCanvasUpdate}
      />
    </section>

    <!-- Side Panel -->
    <aside class="side-panel">
      <!-- Webcam Feed -->
      <section class="webcam-section">
        <WebcamPanel 
          active={isWebcamActive}
          settings={userSettings}
          fps={userSettings.fps}
        />
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
    grid-template-columns: 1fr 300px;
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
    min-height: 200px;
  }

  .controls-section {
    flex: 0 0 auto;
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
    }

    .side-panel {
      flex-direction: column;
    }
  }
</style>