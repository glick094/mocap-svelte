<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import WebcamNative from '../components/WebcamNative.svelte';
  import SettingsModal from '../components/SettingsModal.svelte';
  import { GameFlowService, type GameFlowState } from '../services/gameFlowService.js';
  import type { GameMode } from '../services/gameService.js';
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

  // Type definitions
  interface ParticipantInfo {
    participantId: string;
    age: number | null;
    sex: string;
    height: number | null;
  }

  interface CanvasSettings {
    width: number;
    height: number;
  }

  interface UserSettings {
    username: string;
    uiTheme: string;
    gameTheme: string;
    quality: string;
    enableAudio: boolean;
    fps: number;
    enableSmoothing: boolean;
    filterWindowSize: number;
  }

  interface RecordingSession {
    filename: string;
    csvContent: string;
    startTime: number;
    performanceStartTime: number;
    timestamp?: string;
    participantId?: string;
  }

  // App state
  let showSettings = false;
  let isWebcamActive = true;
  let isGameActive = false;
  let gameScore = 0;
  let currentTargetType: string | null = null;
  let scoreBreakdown = { hand: 0, head: 0, knee: 0 };
  let showPoseOverlay = true; // Toggle for pose visibility
  let isDataCollectionMode = true; // Toggle for data collection vs practice mode
  
  // Game flow state
  let gameFlowService: GameFlowService | null = null;
  let gameFlowState: GameFlowState = {
    currentGameIndex: -1,
    currentGame: null,
    phase: 'waiting',
    isActive: false,
    delayStartTime: null,
    delayRemaining: 0
  };
  let isFlowMode = true;
  let randomGameTimer: number | null = null;
  let randomGameTimeRemaining = 0;
  
  // Manual game countdown state
  let isCountdownActive = false;
  let countdownRemaining = 0;
  let countdownTimer: number | null = null;
  
  // Game modes
  const GAME_MODES = {
    HIPS_SWAY: 'hips-sway',
    HANDS_FIXED: 'hands-fixed', 
    HEAD_FIXED: 'head-fixed',
    RANDOM: 'random'
  };
  
  let currentGameMode: GameMode = GAME_MODES.HIPS_SWAY as GameMode;
  let gameModeProgress = { completed: 0, total: 8 };
  
  // Settings
  let canvasSettings: CanvasSettings = {
    width: window.innerWidth || 1920,
    height: window.innerHeight - 80 || 1000
  };

  let userSettings: UserSettings = {
    username: '',
    uiTheme: 'dark',
    gameTheme: 'vibrant',
    quality: 'high',
    enableAudio: true,
    fps: 30,
    enableSmoothing: true,
    filterWindowSize: 7
  };

  // Participant information
  let participantInfo: ParticipantInfo = {
    participantId: '',
    age: null,
    sex: '',
    height: null
  };

  // Recording state
  let isRecording = false;
  let recordingSession: RecordingSession | null = null;
  let poseDataBuffer: any[] = [];
  let mediaRecorder: MediaRecorder | null = null;
  let videoStream: MediaStream | null = null;

  // WebcamNative component reference
  let webcamNativeComponent: WebcamNative;

  function openSettings() {
    showSettings = true;
  }

  function closeSettings() {
    showSettings = false;
  }

  function saveSettings(event: CustomEvent) {
    const { userSettings: newUserSettings, canvasSettings: newCanvasSettings, participantInfo: newParticipantInfo } = event.detail;
    userSettings = { ...userSettings, ...newUserSettings };
    if (newCanvasSettings) {
      canvasSettings = { ...canvasSettings, ...newCanvasSettings };
    }
    if (newParticipantInfo) {
      participantInfo = { ...participantInfo, ...newParticipantInfo };
    }
    
    closeSettings();
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    localStorage.setItem('canvasSettings', JSON.stringify(canvasSettings));
    localStorage.setItem('participantInfo', JSON.stringify(participantInfo));
    console.log('Settings saved:', { userSettings, canvasSettings, participantInfo });
  }

  function toggleWebcam() {
    if (isRecording && !isWebcamActive) {
      stopRecording();
    }
    
    if (!isWebcamActive) {
      videoStream = null;
    }
    
    isWebcamActive = !isWebcamActive;
  }

  function toggleGame() {
    if (!isWebcamActive) {
      alert('Please start the camera first to play the game!');
      return;
    }
    
    if (isFlowMode) {
      // In flow mode, toggle the entire flow
      toggleGameFlow();
    } else {
      // In manual mode, toggle individual game
      if (!isGameActive && !isCountdownActive) {
        // Start countdown before game
        startCountdown();
      } else if (isGameActive) {
        // Stop active game
        stopGame();
      } else if (isCountdownActive) {
        // Cancel countdown
        cancelCountdown();
      }
    }
  }
  
  function startCountdown() {
    isCountdownActive = true;
    countdownRemaining = 10; // 10 second countdown
    
    countdownTimer = setInterval(() => {
      countdownRemaining--;
      
      if (countdownRemaining <= 0) {
        // Countdown finished, start the game
        clearInterval(countdownTimer!);
        countdownTimer = null;
        isCountdownActive = false;
        
        // Actually start the game
        isGameActive = true;
        resetGameModeProgress();
        if (webcamNativeComponent) {
          webcamNativeComponent.startGame();
        }
        
        // Start timer for random games in manual mode
        if (currentGameMode === 'random') {
          startRandomGameTimer();
        }
        
        console.log('Game started after countdown');
      }
    }, 1000);
    
    console.log('Starting 15-second countdown for manual game');
  }
  
  function cancelCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    isCountdownActive = false;
    countdownRemaining = 0;
    console.log('Countdown cancelled');
  }
  
  function stopGame() {
    isGameActive = false;
    currentTargetType = null;
    if (webcamNativeComponent) {
      webcamNativeComponent.stopGame();
    }
    
    // Clean up random game timer for manual mode
    if (randomGameTimer) {
      clearInterval(randomGameTimer);
      randomGameTimer = null;
      randomGameTimeRemaining = 0;
    }
    
    console.log('Game stopped');
  }
  
  function toggleGameFlow() {
    if (gameFlowState.isActive) {
      stopGameFlow();
    } else {
      startGameFlow();
    }
  }
  
  function startGameFlow() {
    if (!isWebcamActive) {
      alert('Please start the camera first to play games!');
      return;
    }
    
    console.log('Starting game flow');
    
    if (!gameFlowService) {
      initializeGameFlow();
    }
    
    if (!isRecording && isDataCollectionMode) {
      startPoseDataRecording();
    }
    
    gameFlowService!.startFlow();
    gameFlowState = gameFlowService!.getState();
  }
  
  function stopGameFlow() {
    console.log('Stopping game flow');
    
    if (gameFlowService) {
      gameFlowService.stopFlow();
      gameFlowState = gameFlowService.getState();
    }
    
    if (randomGameTimer) {
      clearInterval(randomGameTimer);
      randomGameTimer = null;
      randomGameTimeRemaining = 0;
    }
    
    isGameActive = false;
    currentTargetType = null;
    
    if (isRecording) {
      stopRecording();
    }
  }
  
  function initializeGameFlow() {
    gameFlowService = new GameFlowService({
      games: [GAME_MODES.HIPS_SWAY, GAME_MODES.HANDS_FIXED, GAME_MODES.HEAD_FIXED, GAME_MODES.RANDOM] as GameMode[],
      delayBetweenGames: 10000, // 10 seconds (countdown timer)
      autoStartRecording: isDataCollectionMode
    });
    
    gameFlowService.setCallbacks({
      onGameStart: (gameMode, gameIndex) => {
        console.log(`Flow: Starting game ${gameIndex + 1}: ${gameMode}`);
        console.log('Setting currentGameMode to:', gameMode);
        currentGameMode = gameMode;
        isGameActive = true;
        resetGameModeProgress();
        
        if (webcamNativeComponent) {
          // Ensure game mode is updated before starting the game
          webcamNativeComponent.updateGameMode(gameMode);
          console.log('Calling webcamNativeComponent.startGame()');
          webcamNativeComponent.startGame();
        }
        
        if (gameMode === GAME_MODES.RANDOM) {
          startRandomGameTimer();
        }
      },
      
      onGameEnd: (gameMode, gameIndex) => {
        console.log(`Flow: Ending game ${gameIndex + 1}: ${gameMode}`);
        isGameActive = false;
        currentTargetType = null;
        
        // Clean up random game timer if needed
        if (randomGameTimer) {
          clearInterval(randomGameTimer);
          randomGameTimer = null;
          randomGameTimeRemaining = 0;
        }
      },
      
      onDelayStart: (nextGame, delayTime) => {
        console.log(`Flow: Starting ${delayTime / 1000}s delay before ${nextGame}`);
        console.log('Next game will be:', nextGame);
        isGameActive = false;
        currentTargetType = null;
      },
      
      onDelayUpdate: (_remaining) => {
        gameFlowState = gameFlowService!.getState();
      },
      
      onFlowComplete: () => {
        console.log('Flow: All games completed!');
        isGameActive = false;
        currentTargetType = null;
        
        if (randomGameTimer) {
          clearInterval(randomGameTimer);
          randomGameTimer = null;
          randomGameTimeRemaining = 0;
        }
        
        if (isRecording) {
          stopRecording();
        }
      }
    });
  }
  
  function changeGameMode(newMode: GameMode) {
    if (isFlowMode) {
      return;
    }
    
    if (isGameActive) {
      isGameActive = false;
      currentTargetType = null;
    }
    currentGameMode = newMode;
    resetGameModeProgress();
    console.log('Game mode changed to:', newMode);
  }
  
  function resetGameModeProgress() {
    switch (currentGameMode) {
      case GAME_MODES.HIPS_SWAY:
        gameModeProgress = { completed: 0, total: 8 };
        break;
      case GAME_MODES.HANDS_FIXED:
        gameModeProgress = { completed: 0, total: 34 };
        break;
      case GAME_MODES.HEAD_FIXED:
        gameModeProgress = { completed: 0, total: 13 };
        break;
      case GAME_MODES.RANDOM:
        gameModeProgress = { completed: 0, total: Infinity };
        break;
    }
  }
  
  function startRandomGameTimer() {
    randomGameTimeRemaining = 30;
    console.log('Starting 30-second timer for random game');
    
    randomGameTimer = setInterval(() => {
      randomGameTimeRemaining--;
      
      if (randomGameTimeRemaining <= 0) {
        console.log('Random game time expired');
        clearInterval(randomGameTimer!);
        randomGameTimer = null;
        randomGameTimeRemaining = 0;
        
        if (gameFlowService) {
          // Flow mode: let the game flow service handle the timeout
          gameFlowService.onRandomGameTimeout();
          gameFlowState = gameFlowService.getState();
        } else {
          // Manual mode: stop the game directly
          stopGame();
        }
      }
    }, 1000);
  }

  // Event handlers
  function handleStreamReady(event: CustomEvent) {
    videoStream = event.detail;
    console.log('Video stream ready for recording:', {
      streamId: videoStream?.id,
      active: videoStream?.active,
      videoTracks: videoStream?.getVideoTracks().length,
      audioTracks: videoStream?.getAudioTracks().length
    });
  }

  function handlePoseUpdate(event: CustomEvent) {
    const rawPoseData = event.detail;
    
    if (isRecording && recordingSession && isDataCollectionMode) {
      const unixTimestamp = Date.now();
      const preciseFrameTime = performance.now() - recordingSession.performanceStartTime;
      const csvRow = formatPoseDataForCSV(rawPoseData, unixTimestamp, preciseFrameTime);
      recordingSession.csvContent += csvRow;
      poseDataBuffer.push({
        timestamp: unixTimestamp,
        frameTime: preciseFrameTime,
        data: rawPoseData
      });
    }
  }

  function handleGameStarted(event: CustomEvent) {
    console.log('Game started!', event.detail);
    gameScore = event.detail.score;
    scoreBreakdown = event.detail.scoreBreakdown;
  }

  function handleScoreUpdate(event: CustomEvent) {
    gameScore = event.detail.score;
    currentTargetType = event.detail.targetType;
    scoreBreakdown = event.detail.scoreBreakdown;
    
    if (event.detail.modeProgress) {
      gameModeProgress = event.detail.modeProgress;
    }
  }

  function handleGameEnded(event: CustomEvent) {
    console.log('Game ended!', event.detail);
    gameScore = event.detail.finalScore;
    currentTargetType = null;
    
    if (isFlowMode && gameFlowService) {
      console.log('Calling gameFlowService.onGameCompleted()');
      gameFlowService.onGameCompleted();
      gameFlowState = gameFlowService.getState();
      console.log('Updated gameFlowState:', gameFlowState);
    }
  }

  function handleTargetChanged(event: CustomEvent) {
    currentTargetType = event.detail.targetType;
  }

  function handleTargetDataUpdate(event: CustomEvent) {
    const targetData = event.detail;
    (window as any).currentTargetData = targetData;
  }

  // Recording functions
  function startPoseDataRecording() {
    if (isRecording) return;

    const participant = generateParticipantId(userSettings);
    const timestamp = generateTimestamp();
    
    recordingSession = {
      participantId: participant,
      timestamp: timestamp,
      filename: `pose_data_native_${participant}_${timestamp}.csv`,
      csvContent: createCSVHeader(),
      startTime: Date.now(),
      performanceStartTime: performance.now()
    };

    isRecording = true;
    poseDataBuffer = [];

    const videoStarted = startLocalVideoRecording(participant, timestamp);
    if (!videoStarted) {
      console.warn('Video recording failed to start - stream may not be ready yet');
      setTimeout(() => {
        const retryVideoStarted = startLocalVideoRecording(participant, timestamp);
        console.log('Video recording retry result:', retryVideoStarted);
      }, 1000);
    }

    console.log('Started recording pose data:', recordingSession!.filename);
  }

  function startLocalVideoRecording(participant: string, timestamp: string): boolean {
    if (!videoStream) {
      console.warn('Video stream not available for recording');
      return false;
    }

    if (!videoStream.active) {
      console.warn('Video stream is not active');
      return false;
    }

    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        console.log('Stopping existing MediaRecorder before starting new one');
        mediaRecorder.stop();
      }

      let options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000
      };
      
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options.mimeType = 'video/webm;codecs=vp8';
      }
      
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options = {};
      }

      console.log('Creating MediaRecorder with options:', options);
      mediaRecorder = new MediaRecorder(videoStream, options);
      
      let videoChunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log(`Video recording stopped. Total chunks: ${videoChunks.length}`);
        
        if (videoChunks.length === 0) {
          console.warn('No video chunks recorded!');
          return;
        }

        const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
        const startUnixTime = recordingSession?.startTime || Date.now();
        const filename = `webcam_native_${participant}_${timestamp}_start${startUnixTime}.webm`;
        
        downloadFile(videoBlob, filename, 'video/webm');
        console.log('Video recording saved:', filename);
        videoChunks = [];
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
      };
      
      mediaRecorder.start(100);
      console.log(`Video recording started for participant ${participant}`);
      return true;
      
    } catch (error) {
      console.error('Failed to start video recording:', error);
      return false;
    }
  }

  function stopRecording() {
    if (!isRecording || !recordingSession) return;

    isRecording = false;
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    
    const blob = new Blob([recordingSession.csvContent], { type: 'text/csv' });
    downloadFile(blob, recordingSession.filename);

    console.log('Stopped recording. Pose data file downloaded:', recordingSession.filename);
    console.log('Total data points recorded:', poseDataBuffer.length);
    
    recordingSession = null;
    poseDataBuffer = [];
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startPoseDataRecording();
    }
  }

  function updateCanvasSize() {
    const sidePanelWidth = window.innerWidth > 768 ? 0 : 0; // No side panel in native version
    canvasSettings.width = window.innerWidth - sidePanelWidth;
    canvasSettings.height = window.innerHeight - 80;
  }

  onMount(() => {
    // Load saved settings
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

    const savedParticipantInfo = localStorage.getItem('participantInfo');
    if (savedParticipantInfo) {
      try {
        participantInfo = JSON.parse(savedParticipantInfo);
      } catch (e) {
        console.error('Error loading saved participant info:', e);
      }
    }
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    const flowUpdateInterval = setInterval(() => {
      if (gameFlowService) {
        gameFlowService.update();
        gameFlowState = gameFlowService.getState();
      }
    }, 100);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      clearInterval(flowUpdateInterval);
      
      // Clean up countdown timer
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    };
  });
</script>

<svelte:head>
  <title>Play2Move - Native Webcam</title>
  <meta name="description" content="Native webcam motion capture with MediaPipe pose tracking" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
      background: #000;
    }
  </style>
</svelte:head>

<div class="app-container">
  <!-- Header -->
  <header class="app-header">
    <h1>Play2Move <span class="version-badge">Reality</span></h1>
    <div class="header-buttons">
      <button class="header-btn" class:active={isWebcamActive} on:click={toggleWebcam}>
        {isWebcamActive ? '📵 Stop Camera' : '📷 Start Camera'}
      </button>
      
      
      <!-- Pose Visibility Toggle -->
      <button class="header-btn" class:active={showPoseOverlay} on:click={() => showPoseOverlay = !showPoseOverlay}>
        {showPoseOverlay ? '👤 Hide Pose' : '👤 Show Pose'}
      </button>
      
      <!-- Data Collection/Practice Mode Toggle -->
      <button class="header-btn" class:active={isDataCollectionMode} on:click={() => isDataCollectionMode = !isDataCollectionMode}>
        {isDataCollectionMode ? '📊 Collect Data' : '🏃 Practice'}
      </button>
      
      <!-- Mode Toggle Switch -->
      <div class="toggle-switch" class:disabled={isGameActive || gameFlowState.isActive}>
        <button 
          class="toggle-option"
          class:active={isFlowMode}
          on:click={() => isFlowMode = true}
          disabled={isGameActive || gameFlowState.isActive}
        >
          Default
        </button>
        <button 
          class="toggle-option"
          class:active={!isFlowMode}
          on:click={() => isFlowMode = false}
          disabled={isGameActive || gameFlowState.isActive}
        >
          Manual
        </button>
      </div>
      
      <!-- Recording Button (only in manual mode and data collection mode) -->
      {#if !isFlowMode && isDataCollectionMode}
        <button 
          class="header-btn record-btn" 
          class:recording={isRecording}
          on:click={toggleRecording}
          disabled={!isWebcamActive}
        >
          {isRecording ? '⏹️ Stop Recording' : '🔴 Record Data'}
        </button>
      {/if}
      
      <!-- Game Mode Selector (only in manual mode) -->
      {#if !isFlowMode}
        <select 
          class="header-select"
          bind:value={currentGameMode}
          on:change={(e) => changeGameMode((e.target as HTMLSelectElement).value as GameMode)}
          disabled={isGameActive}
        >
          <option value={GAME_MODES.HIPS_SWAY}>Hips</option>
          <option value={GAME_MODES.HANDS_FIXED}>Hands</option>
          <option value={GAME_MODES.HEAD_FIXED}>Head</option>
          <option value={GAME_MODES.RANDOM}>Random</option>
        </select>
      {/if}
      
      <!-- Game Control Button -->
      <button 
        class="header-btn game-btn" 
        class:active={isGameActive || gameFlowState.isActive}
        on:click={toggleGame}
        disabled={!isWebcamActive}
      >
        {#if isFlowMode}
          {gameFlowState.isActive ? '⏹️ Stop games' : '▶️ Play games'}
        {:else if isCountdownActive}
          ⏱️ Starting in {countdownRemaining}s (Cancel)
        {:else}
          {isGameActive ? '⏹️ Stop Game' : '▶️ Start Game'}
        {/if}
        {#if (isGameActive || gameFlowState.isActive) && gameScore > 0}
          <span class="score-badge">{gameScore}</span>
        {/if}
      </button>
      
      <!-- Flow Status Display -->
      {#if isFlowMode && gameFlowState.isActive}
        <div class="flow-status">
          {#if gameFlowState.phase === 'playing'}
            <span class="flow-game">Playing: {gameFlowService && gameFlowState.currentGame ? gameFlowService.getGameDisplayName(gameFlowState.currentGame) : ''}</span>
            {#if gameFlowState.currentGame === GAME_MODES.RANDOM && randomGameTimeRemaining > 0}
              <span class="random-timer">Time: {randomGameTimeRemaining}s</span>
            {/if}
          {:else if gameFlowState.phase === 'delay'}
            <span class="flow-delay">Next in: {gameFlowService?.formatDelayTime(gameFlowState.delayRemaining) || ''}</span>
          {:else if gameFlowState.phase === 'completed'}
            <span class="flow-complete">✅ All Games Complete!</span>
          {/if}
        </div>
      {/if}
      
      <button class="header-btn settings-btn" on:click={openSettings}>
        ⚙️ Settings
      </button>
    </div>
  </header>

  <!-- Main Content Area -->
  <main class="main-content">
    {#if isWebcamActive}
      <WebcamNative
        bind:this={webcamNativeComponent}
        width={canvasSettings.width}
        height={canvasSettings.height}
        gameActive={isGameActive}
        gameMode={currentGameMode}
        {participantInfo}
        {showPoseOverlay}
        {gameFlowState}
        {isCountdownActive}
        {countdownRemaining}
        {isDataCollectionMode}
        on:poseUpdate={handlePoseUpdate}
        on:streamReady={handleStreamReady}
        on:gameStarted={handleGameStarted}
        on:scoreUpdate={handleScoreUpdate}
        on:gameEnded={handleGameEnded}
        on:targetChanged={handleTargetChanged}
        on:targetDataUpdate={handleTargetDataUpdate}
      />
    {:else}
      <div class="webcam-inactive">
        <div class="camera-icon">📷</div>
        <h2>Reality Mode</h2>
        <p>Camera is currently inactive</p>
        <p>This version draws pose tracking and game elements directly on the webcam feed</p>
        <small>Use the camera button in the header to start</small>
      </div>
    {/if}
  </main>

  <!-- Settings Modal -->
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
    height: 100vh;
    background: #000;
    color: white;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    overflow: hidden;
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
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .version-badge {
    background: rgba(255, 136, 0, 0.2);
    border: 1px solid rgba(255, 136, 0, 0.5);
    color: #ff8800;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
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
    text-decoration: none;
  }

  .header-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }


  .header-select {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.9rem;
    min-width: 150px;
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

  .toggle-switch {
    display: flex;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    overflow: hidden;
  }

  .toggle-switch.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .toggle-option {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.9rem;
  }

  .toggle-option.active {
    background: rgba(0, 255, 136, 0.2);
    color: #00ff88;
    font-weight: 600;
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

  .flow-status {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .flow-game {
    color: #00ff88;
  }

  .flow-delay {
    color: #ff8800;
  }

  .flow-complete {
    color: #00ff88;
  }

  .random-timer {
    color: #ff4444;
    margin-left: 1rem;
    font-weight: bold;
  }

  @keyframes pulse-orange {
    0%, 100% { box-shadow: 0 0 5px rgba(255, 136, 0, 0.3); }
    50% { box-shadow: 0 0 15px rgba(255, 136, 0, 0.7); }
  }

  @keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 5px rgba(255, 68, 68, 0.3); }
    50% { box-shadow: 0 0 15px rgba(255, 68, 68, 0.7); }
  }

  .main-content {
    padding-top: 80px;
    height: calc(100vh - 80px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    overflow: hidden;
  }

  .webcam-inactive {
    text-align: center;
    color: #888;
    padding: 4rem;
    max-width: 600px;
  }

  .camera-icon {
    font-size: 4rem;
    margin-bottom: 2rem;
  }

  .webcam-inactive h2 {
    margin: 1rem 0;
    color: #fff;
    font-size: 2rem;
  }

  .webcam-inactive p {
    margin: 1rem 0;
    font-size: 1.1rem;
    line-height: 1.5;
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
  }
</style>