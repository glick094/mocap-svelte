<script>
  import { createEventDispatcher } from 'svelte';

  export let userSettings = {
    username: '',
    theme: 'dark',
    quality: 'high',
    enableAudio: true,
    fps: 15
  };

  export let canvasSettings = {
    width: 800,
    height: 600,
    frameColor: '#333'
  };

  const dispatch = createEventDispatcher();

  // Local copy for editing
  let localSettings = { ...userSettings };
  let localCanvasSettings = { ...canvasSettings };

  // Canvas presets
  const canvasPresets = [
    { name: 'Small', width: 600, height: 400 },
    { name: 'Medium', width: 800, height: 600 },
    { name: 'Large', width: 1200, height: 800 },
    { name: 'HD', width: 1920, height: 1080 }
  ];

  function applyCanvasPreset(preset) {
    localCanvasSettings.width = preset.width;
    localCanvasSettings.height = preset.height;
    localCanvasSettings = { ...localCanvasSettings }; // Trigger reactivity
  }

  function closeModal() {
    dispatch('close');
  }

  function saveSettings() {
    dispatch('save', { 
      userSettings: localSettings,
      canvasSettings: localCanvasSettings 
    });
  }

  function resetToDefaults() {
    localSettings = {
      username: '',
      theme: 'dark',
      quality: 'high',
      enableAudio: true,
      fps: 15
    };
    localCanvasSettings = {
      width: 800,
      height: 600,
      frameColor: '#333'
    };
  }

  // Handle escape key
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }

  // Click outside to close
  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal-backdrop" on:click={handleBackdropClick} on:keydown={handleKeydown} role="dialog" aria-modal="true" tabindex="-1">
  <div class="modal-container">
    <div class="modal-header">
      <h2>⚙️ Settings</h2>
      <button class="close-btn" on:click={closeModal}>✕</button>
    </div>

    <div class="modal-content">
      <form on:submit|preventDefault={saveSettings}>
        <!-- User Profile -->
        <section class="settings-section">
          <h3>👤 Profile</h3>
          <div class="form-group">
            <label for="username">Username:</label>
            <input 
              id="username"
              type="text" 
              bind:value={localSettings.username}
              placeholder="Enter your username"
            />
          </div>
        </section>

        <!-- Appearance -->
        <section class="settings-section">
          <h3>🎨 Appearance</h3>
          <div class="form-group">
            <label for="theme">Theme:</label>
            <select id="theme" bind:value={localSettings.theme}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="auto">Auto</option>
            </select>
          </div>
        </section>

        <!-- Performance -->
        <section class="settings-section">
          <h3>⚡ Performance</h3>
          <div class="form-group">
            <label for="quality">Render Quality:</label>
            <select id="quality" bind:value={localSettings.quality}>
              <option value="low">Low (Better Performance)</option>
              <option value="medium">Medium</option>
              <option value="high">High (Better Quality)</option>
              <option value="ultra">Ultra (Best Quality)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="fps">MediaPipe FPS:</label>
            <input 
              id="fps"
              type="number" 
              bind:value={localSettings.fps}
              min="5"
              max="30"
              step="5"
            />
            <small>Higher FPS = more responsive but uses more CPU</small>
          </div>
        </section>

        <!-- Canvas Settings -->
        <section class="settings-section">
          <h3>🖼️ Canvas Settings</h3>
          
          <div class="form-group">
            <label>Size Presets:</label>
            <div class="preset-buttons">
              {#each canvasPresets as preset}
                <button 
                  type="button"
                  class="preset-btn"
                  class:active={localCanvasSettings.width === preset.width && localCanvasSettings.height === preset.height}
                  on:click={() => applyCanvasPreset(preset)}
                >
                  {preset.name}
                </button>
              {/each}
            </div>
          </div>

          <div class="form-group">
            <label for="frame-color">Frame Color:</label>
            <input 
              id="frame-color"
              type="color" 
              bind:value={localCanvasSettings.frameColor}
              class="color-input"
            />
          </div>

          <div class="size-controls">
            <div class="size-input">
              <label for="canvas-width">Width:</label>
              <input 
                id="canvas-width"
                type="number" 
                bind:value={localCanvasSettings.width}
                min="200"
                max="2000"
                step="50"
              />
            </div>
            <div class="size-input">
              <label for="canvas-height">Height:</label>
              <input 
                id="canvas-height"
                type="number" 
                bind:value={localCanvasSettings.height}
                min="200"
                max="2000"
                step="50"
              />
            </div>
          </div>
        </section>

        <!-- Audio/Video -->
        <section class="settings-section">
          <h3>🔊 Audio & Video</h3>
          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                bind:checked={localSettings.enableAudio}
              />
              <span class="checkmark"></span>
              Enable Audio Recording
            </label>
          </div>
        </section>

        <!-- Advanced Settings -->
        <section class="settings-section">
          <h3>🔧 Advanced</h3>
          <div class="advanced-info">
            <p>Additional settings will be available in future updates:</p>
            <ul>
              <li>Custom keybindings</li>
              <li>Export preferences</li>
              <li>Cloud sync options</li>
              <li>Plugin management</li>
            </ul>
          </div>
        </section>
      </form>
    </div>

    <div class="modal-footer">
      <button class="btn secondary" on:click={resetToDefaults}>
        🔄 Reset to Defaults
      </button>
      <div class="button-group">
        <button class="btn secondary" on:click={closeModal}>
          Cancel
        </button>
        <button class="btn primary" on:click={saveSettings}>
          💾 Save Settings
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 2rem;
  }

  .modal-container {
    background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    width: 100%;
    max-width: 500px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.3);
  }

  .modal-header h2 {
    margin: 0;
    color: #fff;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
    transition: color 0.2s ease;
  }

  .close-btn:hover {
    color: #fff;
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .settings-section {
    padding: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .settings-section:last-child {
    border-bottom: none;
  }

  .settings-section h3 {
    margin: 0 0 1rem 0;
    color: #00ff88;
    font-size: 1rem;
    font-weight: 500;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: #ccc;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    border-radius: 6px;
    font-size: 0.9rem;
    transition: all 0.2s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #00ff88;
    background: rgba(255, 255, 255, 0.1);
    box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.2);
  }

  .checkbox-group {
    margin-bottom: 0;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    cursor: pointer;
    margin-bottom: 0;
    color: #fff;
  }

  .checkbox-label input[type="checkbox"] {
    display: none;
  }

  .checkmark {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    margin-right: 0.75rem;
    position: relative;
    transition: all 0.2s ease;
  }

  .checkbox-label input[type="checkbox"]:checked + .checkmark {
    background: #00ff88;
    border-color: #00ff88;
  }

  .checkbox-label input[type="checkbox"]:checked + .checkmark::after {
    content: '✓';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #000;
    font-weight: bold;
    font-size: 12px;
  }

  .advanced-info {
    color: #888;
    font-size: 0.85rem;
  }

  .advanced-info p {
    margin: 0 0 0.5rem 0;
  }

  .advanced-info ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .advanced-info li {
    margin-bottom: 0.25rem;
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.3);
  }

  .button-group {
    display: flex;
    gap: 0.75rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn.primary {
    background: #00ff88;
    color: #000;
  }

  .btn.primary:hover {
    background: #00cc6a;
    transform: translateY(-1px);
  }

  .btn.secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .btn.secondary:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  /* Scrollbar styling */
  .modal-content::-webkit-scrollbar {
    width: 6px;
  }

  .modal-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
  }

  .modal-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }

  .modal-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }

  /* Canvas Settings Styles */
  .preset-buttons {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .preset-btn {
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
    color: white;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.8rem;
  }

  .preset-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .preset-btn.active {
    background: rgba(0, 255, 136, 0.2);
    border-color: rgba(0, 255, 136, 0.5);
    color: #00ff88;
  }

  .color-input {
    width: 60px;
    height: 40px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    padding: 0;
  }

  .size-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .size-input {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .size-input label {
    margin-bottom: 0;
    font-size: 0.8rem;
    color: #ccc;
  }

  .size-input input {
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
    color: white;
    border-radius: 4px;
    font-size: 0.8rem;
  }
</style>