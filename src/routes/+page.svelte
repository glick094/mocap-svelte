<script>
  import { onMount } from 'svelte';
  
  // Suppress MediaPipe console warnings on mount
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;
  import ThreeJSCanvas from '../components/ThreeJSCanvas.svelte';
  import WebcamPose from '../components/WebcamPose.svelte';
  import SettingsModal from '../components/SettingsModal.svelte';
  
  // Import services
  import { 
    generateTimestamp, 
    generateParticipantId, 
    formatPoseDataForCSV,
    createCSVHeader,
    startRecordingSession,
    downloadFile,
    startVideoRecording,
    stopVideoRecording
  } from '../services/recordingService.js';
  
  import { smoothLandmarks as smoothLandmarksService } from '../services/smoothingService.js';

  // App state
  let showSettings = false;
  let isWebcamActive = true; // Start with webcam active
  let isGameActive = false; // Game state
  let gameScore = 0; // Current game score
  let currentTargetType = null; // Current target type for display
  let scoreBreakdown = { hand: 0, head: 0, knee: 0 }; // Score breakdown by body part
  let canvasSettings = {
    width: window.innerWidth || 1920,
    height: window.innerHeight - 80 || 1000 // Subtract header height
  };

  // Settings data
  let userSettings = {
    username: '',
    theme: 'dark',
    quality: 'high',
    enableAudio: true,
    fps: 15,
    enableSmoothing: true,
    filterWindowSize: 5
  };

  // WebcamPose dimensions
  let webcamWidth = 300;
  let webcamHeight = 225;
  
  // Pose data for 3D visualization
  let currentPoseData = null;
  let poseHistory = [];
  const maxPoseHistory = 60; // Keep last 60 frames for smoothing
  
  // Smoothing settings
  let enableSmoothing = true;
  let filterWindowSize = 5; // Window size for Savgol filter (must be odd)
  let polynomialOrder = 2; // Polynomial order for Savgol filter

  // Recording state
  let isRecording = false;
  let recordingStartTime = null;
  let poseDataBuffer = [];
  let participantId = '';
  let recordingSession = null;

  // Video recording state
  let mediaRecorder = null;
  let videoChunks = [];
  let videoStream = null;

  // Game data recording state
  let gameDataBuffer = [];
  let gameDataSession = null;

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
    
    // Update smoothing settings
    enableSmoothing = userSettings.enableSmoothing;
    filterWindowSize = userSettings.filterWindowSize;
    
    closeSettings();
    // Save to localStorage
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    localStorage.setItem('canvasSettings', JSON.stringify(canvasSettings));
    console.log('Settings saved:', { userSettings, canvasSettings });
  }

  function toggleWebcam() {
    // Stop recording if active when turning off webcam
    if (isRecording && !isWebcamActive) {
      stopRecording();
    }
    
    // Clear video stream reference when webcam is turned off
    if (!isWebcamActive) {
      videoStream = null;
    }
    
    isWebcamActive = !isWebcamActive;
  }

  function handleCanvasUpdate(event) {
    // Handle updates from the 3D canvas
    // Logging removed for performance
  }

  function handleGameDataUpdate(event) {
    // Receive game data from ThreeJSCanvas component (smoothed pose data)
    const gameData = event.detail;
    
    // Record game data if recording is active
    if (isRecording && gameDataSession) {
      const unixTimestamp = gameData.timestamp || Date.now(); // Use original MediaPipe timestamp
      const preciseFrameTime = performance.now() - gameDataSession.performanceStartTime; // High-precision relative time
      const csvRow = formatPoseDataForCSV(gameData, unixTimestamp, preciseFrameTime); // Same format as MediaPipe data
      gameDataSession.csvContent += csvRow;
      gameDataBuffer.push({
        timestamp: unixTimestamp,
        frameTime: preciseFrameTime,
        data: gameData // Store smoothed game data
      });
    }
  }

  // Game event handlers
  function handleGameStarted(event) {
    console.log('Game started!', event.detail);
    gameScore = event.detail.score;
    scoreBreakdown = event.detail.scoreBreakdown;
  }

  function handleScoreUpdate(event) {
    // Logging removed for performance
    gameScore = event.detail.score;
    currentTargetType = event.detail.targetType;
    scoreBreakdown = event.detail.scoreBreakdown;
  }

  function handleGameEnded(event) {
    console.log('Game ended!', event.detail);
    gameScore = event.detail.finalScore;
    currentTargetType = null;
    // Keep scoreBreakdown for final display
  }

  function handleTargetChanged(event) {
    currentTargetType = event.detail.targetType;
  }

  function handleTargetDataUpdate(event) {
    // This will be called every frame with current target data
    // We'll add this data to our recording streams
    const targetData = event.detail;
    
    // Store in a global variable that can be accessed by recording functions
    window.currentTargetData = targetData;
  }

  function toggleGame() {
    if (!isWebcamActive) {
      alert('Please start the camera first to play the game!');
      return;
    }
    
    isGameActive = !isGameActive;
    if (!isGameActive) {
      currentTargetType = null; // Clear target type when stopping game
    }
    console.log('Game toggled:', isGameActive ? 'Started' : 'Stopped');
  }
  
  function handleStreamReady(event) {
    // Store video stream for recording
    videoStream = event.detail.stream;
    console.log('Video stream ready for recording');
  }

  function handlePoseUpdate(event) {
    // Receive pose data from WebcamPose component
    const rawPoseData = event.detail;
    
    // Add to history for smoothing
    if (rawPoseData) {
      poseHistory.push(rawPoseData);
      if (poseHistory.length > maxPoseHistory) {
        poseHistory.shift();
      }

      // Apply smoothing to pose landmarks for visualization
      let processedPoseData = { ...rawPoseData };
      if (enableSmoothing && rawPoseData.poseLandmarks) {
        processedPoseData.poseLandmarks = smoothLandmarks(rawPoseData.poseLandmarks);
      }
      
      // Update current pose data for visualization
      currentPoseData = processedPoseData;

      // Record RAW data if recording is active (not smoothed)
      if (isRecording && recordingSession) {
        const unixTimestamp = Date.now(); // Unix timestamp in milliseconds
        const preciseFrameTime = performance.now() - recordingSession.performanceStartTime; // High-precision relative time
        const csvRow = formatPoseDataForCSV(rawPoseData, unixTimestamp, preciseFrameTime); // Use raw data for recording
        recordingSession.csvContent += csvRow;
        poseDataBuffer.push({
          timestamp: unixTimestamp,
          frameTime: preciseFrameTime,
          data: rawPoseData // Store raw data
        });
      }
    }
  }

  function updateCanvasSize() {
    const sidePanelWidth = window.innerWidth > 768 ? 350 : 0; // Hide side panel on mobile
    canvasSettings.width = window.innerWidth - sidePanelWidth;
    canvasSettings.height = window.innerHeight - 80; // Subtract header height
  }

  // Savitzky-Golay filter implementation
  function savgolFilter(data, windowSize, polynomialOrder) {
    if (data.length < windowSize) return data;
    
    const halfWindow = Math.floor(windowSize / 2);
    const result = [...data];
    
    // Precompute Savgol coefficients
    const coefficients = computeSavgolCoefficients(windowSize, polynomialOrder);
    
    for (let i = halfWindow; i < data.length - halfWindow; i++) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        sum += coefficients[j] * data[i - halfWindow + j];
      }
      result[i] = sum;
    }
    
    return result;
  }

  function computeSavgolCoefficients(windowSize, polynomialOrder) {
    const halfWindow = Math.floor(windowSize / 2);
    const A = [];
    const b = new Array(windowSize).fill(0);
    b[halfWindow] = 1; // Central point
    
    // Build Vandermonde matrix
    for (let i = 0; i < windowSize; i++) {
      const x = i - halfWindow;
      const row = [];
      for (let j = 0; j <= polynomialOrder; j++) {
        row.push(Math.pow(x, j));
      }
      A.push(row);
    }
    
    // Solve normal equations: (A^T * A) * c = A^T * b
    const AtA = matrixMultiply(transpose(A), A);
    const Atb = matrixVectorMultiply(transpose(A), b);
    const coeffs = solveLinearSystem(AtA, Atb);
    
    // Get coefficients for central point estimation
    const result = new Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
      const x = i - halfWindow;
      result[i] = 0;
      for (let j = 0; j <= polynomialOrder; j++) {
        result[i] += coeffs[j] * Math.pow(x, j);
      }
    }
    
    return result;
  }

  // Helper functions for matrix operations
  function transpose(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]));
  }

  function matrixMultiply(a, b) {
    const result = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < b[0].length; j++) {
        result[i][j] = 0;
        for (let k = 0; k < b.length; k++) {
          result[i][j] += a[i][k] * b[k][j];
        }
      }
    }
    return result;
  }

  function matrixVectorMultiply(matrix, vector) {
    return matrix.map(row => 
      row.reduce((sum, val, i) => sum + val * vector[i], 0)
    );
  }

  function solveLinearSystem(A, b) {
    // Simple Gaussian elimination for small matrices
    const n = A.length;
    const augmented = A.map((row, i) => [...row, b[i]]);
    
    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
      
      // Make all rows below this one 0 in current column
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j < n + 1; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
    
    // Back substitution
    const solution = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      solution[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        solution[i] -= augmented[i][j] * solution[j];
      }
      solution[i] /= augmented[i][i];
    }
    
    return solution;
  }

  function smoothLandmarks(landmarks) {
    if (!enableSmoothing || poseHistory.length < filterWindowSize) {
      return landmarks;
    }
    
    const smoothedLandmarks = [];
    
    for (let i = 0; i < landmarks.length; i++) {
      // Extract time series for this landmark
      const xValues = poseHistory.slice(-filterWindowSize).map(frame => 
        frame.poseLandmarks && frame.poseLandmarks[i] ? frame.poseLandmarks[i].x : 0
      );
      const yValues = poseHistory.slice(-filterWindowSize).map(frame => 
        frame.poseLandmarks && frame.poseLandmarks[i] ? frame.poseLandmarks[i].y : 0
      );
      const zValues = poseHistory.slice(-filterWindowSize).map(frame => 
        frame.poseLandmarks && frame.poseLandmarks[i] ? frame.poseLandmarks[i].z : 0
      );
      
      // Apply Savgol filter
      const smoothedX = savgolFilter(xValues, filterWindowSize, polynomialOrder);
      const smoothedY = savgolFilter(yValues, filterWindowSize, polynomialOrder);
      const smoothedZ = savgolFilter(zValues, filterWindowSize, polynomialOrder);
      
      // Use the most recent smoothed value
      const centerIndex = Math.floor(filterWindowSize / 2);
      smoothedLandmarks[i] = {
        x: smoothedX[smoothedX.length - 1 - centerIndex] || landmarks[i].x,
        y: smoothedY[smoothedY.length - 1 - centerIndex] || landmarks[i].y,
        z: smoothedZ[smoothedZ.length - 1 - centerIndex] || landmarks[i].z,
        visibility: landmarks[i].visibility
      };
    }
    
    return smoothedLandmarks;
  }

  // Recording functions




  function startLocalVideoRecording(participant, timestamp) {
    if (!videoStream) {
      console.warn('Video stream not available for recording');
      return false;
    }

    try {
      // Reset video chunks
      videoChunks = [];
      
      // Create MediaRecorder with video stream
      const options = {
        mimeType: 'video/webm;codecs=vp9', // Try VP9 first
        videoBitsPerSecond: 2500000 // 2.5 Mbps for good quality
      };
      
      // Fallback to VP8 if VP9 not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
      }
      
      // Final fallback to default
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        delete options.mimeType;
      }

      mediaRecorder = new MediaRecorder(videoStream, options);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        // Create video file when recording stops
        const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = `webcam_recording_${participant}_${timestamp}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(videoUrl);
        
        console.log('Video recording saved:', a.download);
      };
      
      mediaRecorder.start(100); // Collect data every 100ms
      console.log('Video recording started');
      return true;
      
    } catch (error) {
      console.error('Failed to start video recording:', error);
      return false;
    }
  }

  function stopLocalVideoRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder = null;
      console.log('Video recording stopped');
    }
  }

  function startRecording() {
    if (isRecording) return;

    const participant = generateParticipantId(userSettings);
    const timestamp = generateTimestamp();
    
    recordingSession = {
      participantId: participant,
      timestamp: timestamp,
      filename: `pose_data_${participant}_${timestamp}.csv`,
      csvContent: createCSVHeader(),
      performanceStartTime: performance.now() // High-precision start time for relative timing
    };

    // Initialize game data recording session
    gameDataSession = {
      participantId: participant,
      timestamp: timestamp,
      filename: `game_data_${participant}_${timestamp}.csv`,
      csvContent: createCSVHeader(), // Same format as MediaPipe data
      performanceStartTime: performance.now() // Same start time for synchronization
    };

    isRecording = true;
    recordingStartTime = Date.now(); // Unix timestamp for absolute timing
    poseDataBuffer = [];
    gameDataBuffer = [];

    // Start video recording
    const videoStarted = startLocalVideoRecording(participant, timestamp);

    console.log('Started recording pose data:', recordingSession.filename);
    console.log('Started recording game data:', gameDataSession.filename);
    console.log('Video recording started:', videoStarted);
    console.log('Recording start time (Unix):', recordingStartTime);
    console.log('Performance start time:', recordingSession.performanceStartTime);
  }

  function stopRecording() {
    if (!isRecording || !recordingSession) return;

    isRecording = false;
    
    // Stop video recording
    stopLocalVideoRecording();
    
    // Create and download the MediaPipe CSV file
    const blob = new Blob([recordingSession.csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = recordingSession.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Create and download the game data CSV file
    if (gameDataSession) {
      const gameBlob = new Blob([gameDataSession.csvContent], { type: 'text/csv' });
      const gameUrl = URL.createObjectURL(gameBlob);
      const gameA = document.createElement('a');
      gameA.href = gameUrl;
      gameA.download = gameDataSession.filename;
      document.body.appendChild(gameA);
      gameA.click();
      document.body.removeChild(gameA);
      URL.revokeObjectURL(gameUrl);
    }

    console.log('Stopped recording. Files downloaded:', recordingSession.filename);
    console.log('Game data file downloaded:', gameDataSession?.filename);
    console.log('Total MediaPipe data points recorded:', poseDataBuffer.length);
    console.log('Total game data points recorded:', gameDataBuffer.length);
    
    // Reset recording state
    recordingSession = null;
    gameDataSession = null;
    recordingStartTime = null;
    poseDataBuffer = [];
    gameDataBuffer = [];
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  onMount(() => {
    // Filter MediaPipe WebGL warnings
    console.warn = function(message, ...args) {
      // Suppress MediaPipe WebGL warnings
      if (typeof message === 'string' && 
          (message.includes('WebGL') || 
           message.includes('OpenGL') || 
           message.includes('gl_context') ||
           message.includes('drawArraysInstanced'))) {
        return;
      }
      originalConsoleWarn.call(this, message, ...args);
    };
    
    console.log = function(message, ...args) {
      // Suppress MediaPipe verbose logging
      if (typeof message === 'string' && 
          (message.includes('I0000') || 
           message.includes('GL version') ||
           message.includes('gl_context'))) {
        return;
      }
      originalConsoleLog.call(this, message, ...args);
    };
    
    // Load saved settings on app start
    const savedUserSettings = localStorage.getItem('userSettings');
    if (savedUserSettings) {
      try {
        userSettings = JSON.parse(savedUserSettings);
        // Initialize smoothing settings
        enableSmoothing = userSettings.enableSmoothing ?? true;
        filterWindowSize = userSettings.filterWindowSize ?? 5;
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
      // Restore original console functions
      console.warn = originalConsoleWarn;
      console.log = originalConsoleLog;
      window.removeEventListener('resize', updateCanvasSize);
    };
  });
</script>

<svelte:head>
  <title>Play2Move</title>
  <meta name="description" content="Interactive 3D motion capture with webcam and MediaPipe pose tracking" />
</svelte:head>

<div class="app-container">
  <!-- Header -->
  <header class="app-header">
    <h1>Play2Move</h1>
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
      <button 
        class="header-btn game-btn" 
        class:active={isGameActive}
        on:click={toggleGame}
        disabled={!isWebcamActive}
      >
        {isGameActive ? '⏹️ Stop Game' : '🎮 Start Game'}
        {#if isGameActive && gameScore > 0}
          <span class="score-badge">{gameScore}</span>
        {/if}
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
        poseData={currentPoseData}
        gameActive={isGameActive}
        on:update={handleCanvasUpdate}
        on:gameDataUpdate={handleGameDataUpdate}
        on:gameStarted={handleGameStarted}
        on:scoreUpdate={handleScoreUpdate}
        on:gameEnded={handleGameEnded}
        on:targetChanged={handleTargetChanged}
        on:targetDataUpdate={handleTargetDataUpdate}
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
            gameActive={isGameActive}
            gameScore={gameScore}
            currentTargetType={currentTargetType}
            scoreBreakdown={scoreBreakdown}
            on:poseUpdate={handlePoseUpdate}
            on:streamReady={handleStreamReady}
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

  .game-btn.active {
    background: rgba(255, 136, 0, 0.4);
    box-shadow: 0 0 10px rgba(255, 136, 0, 0.5);
    animation: pulse-orange 1s infinite;
  }

  .game-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .score-badge {
    background: rgba(255, 255, 255, 0.9);
    color: #ff8800;
    border-radius: 10px;
    padding: 2px 6px;
    font-size: 0.7rem;
    font-weight: bold;
    margin-left: 0.5rem;
  }

  @keyframes pulse-orange {
    0%, 100% { box-shadow: 0 0 5px rgba(255, 136, 0, 0.3); }
    50% { box-shadow: 0 0 15px rgba(255, 136, 0, 0.7); }
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
    padding: 0.5rem;
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