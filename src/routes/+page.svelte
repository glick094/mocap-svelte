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

  // Recording state
  let isRecording = false;
  let recordingStartTime = null;
  let poseDataBuffer = [];
  let participantId = '';
  let recordingSession = null;

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

      // Record data if recording is active
      if (isRecording && recordingSession) {
        const unixTimestamp = Date.now(); // Unix timestamp in milliseconds
        const preciseFrameTime = performance.now() - recordingSession.performanceStartTime; // High-precision relative time
        const csvRow = formatPoseDataForCSV(currentPoseData, unixTimestamp, preciseFrameTime);
        recordingSession.csvContent += csvRow;
        poseDataBuffer.push({
          timestamp: unixTimestamp,
          frameTime: preciseFrameTime,
          data: currentPoseData
        });
      }
    }
  }

  function updateCanvasSize() {
    const sidePanelWidth = window.innerWidth > 768 ? 350 : 0; // Hide side panel on mobile
    canvasSettings.width = window.innerWidth - sidePanelWidth;
    canvasSettings.height = window.innerHeight - 80; // Subtract header height
  }

  // Recording functions
  function generateTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: YYYY-MM-DDTHH-MM-SS
  }

  function generateParticipantId() {
    if (!participantId) {
      participantId = userSettings.username || `P${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    }
    return participantId;
  }

  function createCSVHeader() {
    const header = [
      'unix_timestamp_ms', // Unix timestamp in milliseconds since epoch
      'frame_time_ms',     // High-precision milliseconds since recording started
      'pose_landmarks_count',
      'left_hand_landmarks_count', 
      'right_hand_landmarks_count',
      'face_landmarks_count'
    ];

    // Add pose landmark columns (33 landmarks, each with x, y, z, visibility)
    for (let i = 0; i < 33; i++) {
      header.push(`pose_${i}_x`, `pose_${i}_y`, `pose_${i}_z`, `pose_${i}_visibility`);
    }

    // Add left hand landmark columns (21 landmarks, each with x, y, z)
    for (let i = 0; i < 21; i++) {
      header.push(`left_hand_${i}_x`, `left_hand_${i}_y`, `left_hand_${i}_z`);
    }

    // Add right hand landmark columns (21 landmarks, each with x, y, z)
    for (let i = 0; i < 21; i++) {
      header.push(`right_hand_${i}_x`, `right_hand_${i}_y`, `right_hand_${i}_z`);
    }

    // Add face landmark columns (468 landmarks, each with x, y, z)
    for (let i = 0; i < 468; i++) {
      header.push(`face_${i}_x`, `face_${i}_y`, `face_${i}_z`);
    }

    return header.join(',') + '\n';
  }

  function formatPoseDataForCSV(poseData, timestamp, frameTime) {
    const row = [
      timestamp,
      frameTime,
      poseData.poseLandmarks ? poseData.poseLandmarks.length : 0,
      poseData.leftHandLandmarks ? poseData.leftHandLandmarks.length : 0,
      poseData.rightHandLandmarks ? poseData.rightHandLandmarks.length : 0,
      poseData.faceLandmarks ? poseData.faceLandmarks.length : 0
    ];

    // Add pose landmarks (33 landmarks)
    for (let i = 0; i < 33; i++) {
      if (poseData.poseLandmarks && i < poseData.poseLandmarks.length) {
        const landmark = poseData.poseLandmarks[i];
        row.push(landmark.x || 0, landmark.y || 0, landmark.z || 0, landmark.visibility || 0);
      } else {
        row.push(0, 0, 0, 0); // Empty landmark
      }
    }

    // Add left hand landmarks (21 landmarks)
    for (let i = 0; i < 21; i++) {
      if (poseData.leftHandLandmarks && i < poseData.leftHandLandmarks.length) {
        const landmark = poseData.leftHandLandmarks[i];
        row.push(landmark.x || 0, landmark.y || 0, landmark.z || 0);
      } else {
        row.push(0, 0, 0); // Empty landmark
      }
    }

    // Add right hand landmarks (21 landmarks)
    for (let i = 0; i < 21; i++) {
      if (poseData.rightHandLandmarks && i < poseData.rightHandLandmarks.length) {
        const landmark = poseData.rightHandLandmarks[i];
        row.push(landmark.x || 0, landmark.y || 0, landmark.z || 0);
      } else {
        row.push(0, 0, 0); // Empty landmark
      }
    }

    // Add face landmarks (468 landmarks)
    for (let i = 0; i < 468; i++) {
      if (poseData.faceLandmarks && i < poseData.faceLandmarks.length) {
        const landmark = poseData.faceLandmarks[i];
        row.push(landmark.x || 0, landmark.y || 0, landmark.z || 0);
      } else {
        row.push(0, 0, 0); // Empty landmark
      }
    }

    return row.join(',') + '\n';
  }

  function startRecording() {
    if (isRecording) return;

    const participant = generateParticipantId();
    const timestamp = generateTimestamp();
    
    recordingSession = {
      participantId: participant,
      timestamp: timestamp,
      filename: `pose_data_${participant}_${timestamp}.csv`,
      csvContent: createCSVHeader(),
      performanceStartTime: performance.now() // High-precision start time for relative timing
    };

    isRecording = true;
    recordingStartTime = Date.now(); // Unix timestamp for absolute timing
    poseDataBuffer = [];

    console.log('Started recording pose data:', recordingSession.filename);
    console.log('Recording start time (Unix):', recordingStartTime);
    console.log('Performance start time:', recordingSession.performanceStartTime);
  }

  function stopRecording() {
    if (!isRecording || !recordingSession) return;

    isRecording = false;
    
    // Create and download the CSV file
    const blob = new Blob([recordingSession.csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = recordingSession.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Stopped recording. File downloaded:', recordingSession.filename);
    console.log('Total data points recorded:', poseDataBuffer.length);
    
    // Reset recording state
    recordingSession = null;
    recordingStartTime = null;
    poseDataBuffer = [];
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
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
      <button 
        class="header-btn record-btn" 
        class:recording={isRecording}
        on:click={toggleRecording}
        disabled={!isWebcamActive}
      >
        {isRecording ? '⏹️ Stop Recording' : '🔴 Record Data'}
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

  .record-btn {
    background: rgba(255, 68, 68, 0.2);
    border-color: rgba(255, 68, 68, 0.5);
    color: #ff4444;
  }

  .record-btn:hover {
    background: rgba(255, 68, 68, 0.3);
  }

  .record-btn.recording {
    background: rgba(255, 68, 68, 0.4);
    box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
    animation: pulse-red 1s infinite;
  }

  .record-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  @keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 5px rgba(255, 68, 68, 0.3); }
    50% { box-shadow: 0 0 15px rgba(255, 68, 68, 0.7); }
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