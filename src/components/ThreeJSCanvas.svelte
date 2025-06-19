<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { GameService, GAME_MODES, TARGET_TYPES } from '../services/gameService';
  import { gameColors, poseColors, hipSwaySettings } from '../stores/themeStore';
  import { gameSettings } from '../stores/gameStore';
  import { audioService } from '../services/audioService';

  const dispatch = createEventDispatcher();

  let canvasElement;
  let ctx;
  let animationId;
  let gameService;

  // Component props
  export let width = 800;
  export let height = 600;
  export let poseData = null;
  export let gameActive = false;
  export let gameMode = 'hips-sway';
  export let gameModeProgress = { completed: 0, total: 8 };

  onMount(() => {
    if (canvasElement) {
      ctx = canvasElement.getContext('2d');
      gameService = new GameService(width, height, gameMode);
      animate();
    }
  });

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    audioService.destroy();
  });


  function animate() {
    animationId = requestAnimationFrame(animate);
    drawFrame();
  }

  function drawFrame() {
    if (!ctx) return;
    
    // Update explosions
    if (gameService) {
      gameService.updateExplosions();
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw pose data if available
    if (poseData) {
      drawPoseVisualization(poseData);
    } else {
      // Draw placeholder text - temporarily flip back to read correctly
      ctx.save();
      ctx.scale(-1, 1); // Flip back horizontally for text
      ctx.fillStyle = '#666';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for pose data...', -width / 2, height / 2);
      ctx.restore();
    }
    
    // Draw explosions
    if (gameService) {
      drawExplosions();
    }
  }

  function drawPoseVisualization(data) {
    if (!ctx) return;
    
    // Draw pose landmarks and connections
    if (data.poseLandmarks) {
      drawPoseLandmarks(data.poseLandmarks);
    }
    
    // Draw hand landmarks
    if (data.leftHandLandmarks) {
      drawHandLandmarks(data.leftHandLandmarks, 'left');
    }
    if (data.rightHandLandmarks) {
      drawHandLandmarks(data.rightHandLandmarks, 'right');
    }
    
    // Draw face landmarks (simplified)
    if (data.faceLandmarks) {
      drawFaceLandmarks(data.faceLandmarks);
    }
    
    // Emit game data (smoothed pose data with same structure as MediaPipe)
    emitGameData(data);
    
    // Check for game collisions if game is active
    if (gameActive && gameService) {
      const collisionResult = gameService.checkCollisions(data);
      if (collisionResult.hit) {
        handleCollision(collisionResult);
      }
    }
    
    // Draw game targets and UI
    if (gameActive && gameService) {
      drawGameElements();
    }
  }

  function emitGameData(data) {
    // Create game data structure that matches MediaPipe format but with smoothed data
    const gameData = {
      poseLandmarks: data.poseLandmarks || null,
      leftHandLandmarks: data.leftHandLandmarks || null,
      rightHandLandmarks: data.rightHandLandmarks || null,
      faceLandmarks: data.faceLandmarks || null,
      timestamp: data.timestamp || Date.now() // Use original timestamp from MediaPipe
    };
    
    // Dispatch the game data for recording
    dispatch('gameDataUpdate', gameData);
  }

  function handleCollision(collisionResult) {
    const { hitType, modeProgress, hitKeypoint, playSound } = collisionResult;
    
    // Play appropriate sound effect based on game mode
    if (playSound) {
      if (gameMode === GAME_MODES.HIPS_SWAY) {
        audioService.playHipSwaySound();
      } else {
        audioService.playPopSound();
      }
    }
    
    dispatch('scoreUpdate', {
      score: gameService.getGameScore(),
      targetType: hitType,
      scoreBreakdown: gameService.getScoreBreakdown(),
      modeProgress: modeProgress,
      hitKeypoint: hitKeypoint
    });
    
    // Check if game is complete
    if (modeProgress && modeProgress.completed >= modeProgress.total) {
      setTimeout(() => {
        dispatch('gameEnded', { 
          finalScore: gameService.getGameScore(), 
          completed: true,
          targetHistory: gameService.getTargetHistory()
        });
      }, 1000);
    }
    
    // For random mode, dispatch target change
    if (gameMode === GAME_MODES.RANDOM && gameService.getCurrentTarget()) {
      dispatch('targetChanged', { targetType: gameService.getCurrentTarget().type });
    }
  }

  function emitTargetData() {
    if (!gameService) return;
    
    const targetData = gameService.getCurrentTargetData();
    dispatch('targetDataUpdate', targetData);
  }

  function startGame() {
    if (!gameService) return;
    
    gameService.startGame();
    
    dispatch('gameStarted', { 
      score: gameService.getGameScore(), 
      scoreBreakdown: gameService.getScoreBreakdown(),
      gameMode: gameMode 
    });
    
    const currentTarget = gameService.getCurrentTarget();
    if (currentTarget) {
      dispatch('targetChanged', { targetType: currentTarget.type });
    }
  }

  function stopGame() {
    if (!gameService) return;
    
    gameService.stopGame();
    dispatch('gameEnded', { 
      finalScore: gameService.getGameScore(), 
      targetHistory: gameService.getTargetHistory()
    });
  }

  // Reactive statement to handle game state changes
  $: if (gameActive && gameService && !gameService.getCurrentTarget()) {
    startGame();
  } else if (!gameActive && gameService && gameService.getCurrentTarget()) {
    stopGame();
  }
  
  // Update game service when dimensions or mode change
  $: if (gameService) {
    gameService.updateDimensions(width, height);
    gameService.updateGameMode(gameMode);
  }

  function drawGameElements() {
    if (!ctx || !gameService) return;
    
    // Emit target data for all game modes
    emitTargetData();
    
    switch (gameMode) {
      case GAME_MODES.HIPS_SWAY:
        drawHipSwayRegions();
        break;
      case GAME_MODES.HANDS_FIXED:
      case GAME_MODES.HEAD_FIXED:
        drawFixedTargets();
        break;
      case GAME_MODES.RANDOM:
      default:
        const currentTarget = gameService.getCurrentTarget();
        if (currentTarget) {
          drawTarget(currentTarget);
        }
        break;
    }
  }
  
  function drawHipSwayRegions() {
    if (!gameService) return;
    
    const hipRegions = gameService.generateHipSwayRegions();
    const hipSwayState = gameService.getHipSwayState();
    if (!hipRegions) return;
    
    ctx.save();
    
    // Get animation offset for the target rectangle
    const animationOffset = gameService.getHipSwayAnimationOffset();
    
    switch (hipSwayState.phase) {
      case 'centering':
        // Only draw center line during centering phase
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(hipRegions.centerLine.x, hipRegions.centerLine.y);
        ctx.lineTo(hipRegions.centerLine.x, hipRegions.centerLine.y + hipRegions.centerLine.height);
        ctx.stroke();
        break;
        
      case 'targeting':
        // Calculate position with animation offset
        let targetRegion = hipSwayState.targetSide === 'left' ? hipRegions.leftRegion : hipRegions.rightRegion;
        let targetColor = hipSwayState.targetSide === 'left' ? $gameColors.hipLeft : $gameColors.hipRight;
        
        let regionX = targetRegion.x;
        let regionY = targetRegion.y;
        let regionOpacity = $hipSwaySettings.fillOpacity;
        
        // Apply animation offset if animating
        if (animationOffset) {
          regionX += animationOffset.offsetX;
          regionY += animationOffset.offsetY;
          regionOpacity *= animationOffset.opacity;
        }
        
        // Draw the target region (with potential animation offset)
        ctx.globalAlpha = regionOpacity;
        ctx.fillStyle = targetColor;
        
        // Add extra glow effect during animation
        if (animationOffset && animationOffset.opacity > 0) {
          ctx.shadowColor = targetColor;
          ctx.shadowBlur = 20 * animationOffset.opacity;
        }
        
        ctx.fillRect(
          regionX,
          regionY,
          targetRegion.width,
          targetRegion.height
        );
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        // Draw outline for current target
        ctx.globalAlpha = $hipSwaySettings.outlineOpacity * (animationOffset ? animationOffset.opacity : 1);
        ctx.strokeStyle = $hipSwaySettings.outlineColor;
        ctx.lineWidth = $hipSwaySettings.outlineWidth;
        ctx.strokeRect(
          regionX,
          regionY,
          targetRegion.width,
          targetRegion.height
        );
        
        // Draw center line for reference
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hipRegions.centerLine.x, hipRegions.centerLine.y);
        ctx.lineTo(hipRegions.centerLine.x, hipRegions.centerLine.y + hipRegions.centerLine.height);
        ctx.stroke();
        break;
        
      case 'completed':
        // Draw both regions faded to show completion
        ctx.globalAlpha = 0.2;
        
        ctx.fillStyle = $gameColors.hipLeft;
        ctx.fillRect(
          hipRegions.leftRegion.x,
          hipRegions.leftRegion.y,
          hipRegions.leftRegion.width,
          hipRegions.leftRegion.height
        );
        
        ctx.fillStyle = $gameColors.hipRight;
        ctx.fillRect(
          hipRegions.rightRegion.x,
          hipRegions.rightRegion.y,
          hipRegions.rightRegion.width,
          hipRegions.rightRegion.height
        );
        
        // Draw center line
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hipRegions.centerLine.x, hipRegions.centerLine.y);
        ctx.lineTo(hipRegions.centerLine.x, hipRegions.centerLine.y + hipRegions.centerLine.height);
        ctx.stroke();
        break;
    }
    
    ctx.restore();
    
    // Draw phase-appropriate text (flip back to correct orientation)
    ctx.save();
    ctx.scale(-1, 1); // Counter-flip the text horizontally
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    
    switch (hipSwayState.phase) {
      case 'centering':
        ctx.fillText(
          $gameSettings.hipSwayTextPrompts.centering.main,
          -width / 2, // Negative x because we flipped
          50
        );
        
        ctx.fillStyle = '#cccccc';
        ctx.font = '18px Arial';
        if (hipSwayState.isCentered) {
          ctx.fillText(
            $gameSettings.hipSwayTextPrompts.centering.subCentered,
            -width / 2,
            height - 30
          );
        } else {
          ctx.fillText(
            $gameSettings.hipSwayTextPrompts.centering.subNotCentered,
            -width / 2,
            height - 30
          );
        }
        break;
        
      case 'targeting':
        const totalTargets = (hipSwayState.leftSideHits + hipSwayState.rightSideHits);
        ctx.fillText(
          $gameSettings.hipSwayTextPrompts.targeting.progress(totalTargets, hipSwayState.leftSideHits, hipSwayState.rightSideHits),
          -width / 2, // Negative x because we flipped
          50
        );
        
        ctx.fillStyle = '#cccccc';
        ctx.font = '18px Arial';
        ctx.fillText(
          $gameSettings.hipSwayTextPrompts.targeting.instruction(hipSwayState.targetSide),
          -width / 2, // Negative x because we flipped
          height - 30
        );
        break;
        
      case 'completed':
        ctx.fillText(
          $gameSettings.hipSwayTextPrompts.completed.main,
          -width / 2, // Negative x because we flipped
          50
        );
        
        ctx.fillStyle = '#cccccc';
        ctx.font = '18px Arial';
        ctx.fillText(
          $gameSettings.hipSwayTextPrompts.completed.score(hipSwayState.leftSideHits + hipSwayState.rightSideHits, 10),
          -width / 2, // Negative x because we flipped
          height - 30
        );
        break;
    }
    
    ctx.restore();
  }
  
  function drawFixedTargets() {
    if (!gameService) return;
    
    const fixedTargets = gameService.getFixedTargets();
    const currentFixedTargetIndex = gameService.getCurrentFixedTargetIndex();
    
    if (fixedTargets.length === 0) return;
    
    fixedTargets.forEach((target, index) => {
      // Convert 0-based array index to 1-based for comparison
      const displayIndex = index + 1;
      if (displayIndex === currentFixedTargetIndex) {
        // Draw current target highlighted
        drawTarget(target, true);
      } else if (displayIndex < currentFixedTargetIndex) {
        // Draw completed targets faded
        ctx.save();
        ctx.globalAlpha = 0.3;
        drawTarget(target, false);
        ctx.restore();
      } else {
        // Draw upcoming targets dimmed
        ctx.save();
        ctx.globalAlpha = 0.1;
        drawTarget(target, false);
        ctx.restore();
      }
    });
    
    // Draw progress text (flip back to correct orientation)
    ctx.save();
    ctx.scale(-1, 1); // Counter-flip the text horizontally
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Progress: ${currentFixedTargetIndex}/${fixedTargets.length}`,
      -width / 2, // Negative x because we flipped
      50
    );
    ctx.restore();
  }

  function drawTarget(target, highlighted = false) {
    if (!ctx) return;
    
    const { x, y, color, type } = target;
    const targetRadius = 50; // Use constant for now
    
    // Draw target circle with glow effect
    ctx.save();
    
    // Outer glow (enhanced if highlighted)
    ctx.shadowColor = color;
    ctx.shadowBlur = highlighted ? 30 : 20;
    ctx.strokeStyle = color;
    ctx.lineWidth = highlighted ? 6 : 4;
    ctx.beginPath();
    ctx.arc(x, y, targetRadius, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Inner circle (pulsing if highlighted)
    ctx.shadowBlur = 0;
    ctx.fillStyle = color + '40'; // Semi-transparent
    ctx.beginPath();
    ctx.arc(x, y, targetRadius - 10, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw icon based on target type
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let icon = '';
    switch(type) {
      case TARGET_TYPES.HAND:
        icon = '✋';
        break;
      case TARGET_TYPES.HEAD:
        icon = '😀';
        break;
      case TARGET_TYPES.KNEE:
        icon = '🦵';
        break;
    }
    
    // Counter-flip the icon text to display correctly
    ctx.save();
    ctx.scale(-1, 1);
    ctx.fillText(icon, -x, y); // Negative x because we flipped
    ctx.restore();
    
    ctx.restore();
  }

  function drawPoseLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0) return;
    
    // MediaPipe pose connections (excluding face connections)
    const connections = [
      // Point 0 (nose center) should float independently - no connections
      [11, 12], // shoulders
      [11, 13], [13, 15], // left arm
      [12, 14], [14, 16], // right arm
      [11, 23], [12, 24], [23, 24], // torso
      [23, 25], [25, 27], [27, 29], [29, 31], // left leg
      [24, 26], [26, 28], [28, 30], [30, 32], // right leg
    ];
    
    // Define which pose landmarks to exclude (face points 1-10 except nose center 0)
    const excludedIndices = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    
    // Define body part landmark groups for color coding
    const headLandmarks = new Set([0]); // Nose center
    const legLandmarks = new Set([23, 24, 25, 26, 27, 28, 29, 30, 31, 32]); // Hips to feet
    const armLandmarks = new Set([11, 12, 13, 14, 15, 16]); // Shoulders to wrists
    
    // Draw connections first (behind landmarks)
    ctx.lineWidth = 3;
    
    connections.forEach(([startIdx, endIdx]) => {
      if (startIdx < landmarks.length && endIdx < landmarks.length &&
          !excludedIndices.has(startIdx) && !excludedIndices.has(endIdx)) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        
        if (start.visibility > 0.5 && end.visibility > 0.5) {
          // Color code connections based on body parts
          if (legLandmarks.has(startIdx) && legLandmarks.has(endIdx)) {
            ctx.strokeStyle = $poseColors.legs;
          } else if (armLandmarks.has(startIdx) && armLandmarks.has(endIdx)) {
            ctx.strokeStyle = $poseColors.arms;
          } else if (headLandmarks.has(startIdx) || headLandmarks.has(endIdx)) {
            ctx.strokeStyle = $poseColors.head;
          } else {
            ctx.strokeStyle = $poseColors.torso;
          }
          
          ctx.beginPath();
          ctx.moveTo(start.x * width, start.y * height);
          ctx.lineTo(end.x * width, end.y * height);
          ctx.stroke();
        }
      }
    });
    
    // Draw landmark points (excluding face points 1-10) with color coding
    landmarks.forEach((landmark, index) => {
      if (!excludedIndices.has(index) && landmark.visibility && landmark.visibility > 0.5) {
        // Color code landmarks based on body parts
        if (headLandmarks.has(index)) {
          ctx.fillStyle = $poseColors.head;
        } else if (legLandmarks.has(index)) {
          ctx.fillStyle = $poseColors.legs;
        } else if (armLandmarks.has(index)) {
          ctx.fillStyle = $poseColors.arms;
        } else {
          ctx.fillStyle = $poseColors.torso;
        }
        
        ctx.beginPath();
        ctx.arc(landmark.x * width, landmark.y * height, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }

  function drawHandLandmarks(landmarks, hand) {
    if (!landmarks || landmarks.length === 0) return;
    
    const color = $poseColors.hands;
    
    // Hand connections for better visualization
    const handConnections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle finger
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring finger
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17] // Palm connections
    ];
    
    // Draw connections
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    handConnections.forEach(([startIdx, endIdx]) => {
      if (startIdx < landmarks.length && endIdx < landmarks.length) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        
        ctx.beginPath();
        ctx.moveTo(start.x * width, start.y * height);
        ctx.lineTo(end.x * width, end.y * height);
        ctx.stroke();
      }
    });
    
    // Draw landmark points
    ctx.fillStyle = color;
    landmarks.forEach((landmark) => {
      ctx.beginPath();
      ctx.arc(landmark.x * width, landmark.y * height, 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  function drawFaceLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0) return;
    
    // Key facial feature landmarks
    const facialFeatures = {
      // Face outline/contour
      faceContour: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
      
      // Left eyebrow
      leftEyebrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 70],
      
      // Right eyebrow  
      rightEyebrow: [296, 334, 293, 300, 276, 283, 282, 295, 285, 336, 296],
      
      // Left eye
      leftEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
      
      // Right eye
      rightEye: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
      
      // Nose
      nose: [1, 2, 5, 4, 6, 168, 8, 9, 10, 151, 195, 197, 51, 48, 115, 131, 134, 102, 49, 220, 281, 360, 279],
      
      // Mouth outer boundary (simplified for clear lines)
      mouthOuter: [324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
      
      // Mouth inner opening (simplified for clear lines) 
      mouthInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 324]
    };
    
    // Draw each facial feature with theme color
    const faceColor = $poseColors.face;
    const featureColors = {
      faceContour: faceColor,
      leftEyebrow: faceColor,
      rightEyebrow: faceColor, 
      leftEye: faceColor,
      rightEye: faceColor,
      nose: faceColor,
      mouthOuter: faceColor,
      mouthInner: faceColor
    };
    
    const featureSizes = {
      faceContour: 2,
      leftEyebrow: 3,
      rightEyebrow: 3,
      leftEye: 3,
      rightEye: 3,
      nose: 2,
      mouthOuter: 3,
      mouthInner: 2
    };
    
    // Draw landmarks for each feature
    Object.entries(facialFeatures).forEach(([featureName, indices]) => {
      ctx.fillStyle = featureColors[featureName];
      const pointSize = featureSizes[featureName];
      
      indices.forEach((index) => {
        if (index < landmarks.length) {
          const landmark = landmarks[index];
          ctx.beginPath();
          ctx.arc(landmark.x * width, landmark.y * height, pointSize, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    });
    
    // Draw connections for key features
    drawFaceConnections(landmarks, facialFeatures);
  }

  function drawFaceConnections(landmarks, facialFeatures) {
    // Define connections for key facial features
    const connections = {
      leftEyebrow: facialFeatures.leftEyebrow.map((_, i, arr) => 
        i < arr.length - 1 ? [arr[i], arr[i + 1]] : null
      ).filter(Boolean),
      
      rightEyebrow: facialFeatures.rightEyebrow.map((_, i, arr) => 
        i < arr.length - 1 ? [arr[i], arr[i + 1]] : null
      ).filter(Boolean),
      
      leftEye: [...facialFeatures.leftEye.map((_, i, arr) => 
        [arr[i], arr[(i + 1) % arr.length]]
      )],
      
      rightEye: [...facialFeatures.rightEye.map((_, i, arr) => 
        [arr[i], arr[(i + 1) % arr.length]]
      )],
      
      // Connect mouth inner as individual line segments
      mouthInner: facialFeatures.mouthInner.map((_, i, arr) => 
        i < arr.length - 1 ? [arr[i], arr[i + 1]] : null
      ).filter(Boolean)
    };
    
    // Draw connections
    Object.entries(connections).forEach(([featureName, featureConnections]) => {
      if (featureName.includes('Eye')) {
        ctx.strokeStyle = $poseColors.face;
        ctx.lineWidth = 1;
      } else if (featureName.includes('Eyebrow')) {
        ctx.strokeStyle = $poseColors.face;
        ctx.lineWidth = 1;
      } else if (featureName.includes('mouth')) {
        ctx.strokeStyle = $poseColors.face;
        ctx.lineWidth = 3;
      }
      
      featureConnections.forEach(([startIdx, endIdx]) => {
        if (startIdx < landmarks.length && endIdx < landmarks.length) {
          const start = landmarks[startIdx];
          const end = landmarks[endIdx];
          
          ctx.beginPath();
          ctx.moveTo(start.x * width, start.y * height);
          ctx.lineTo(end.x * width, end.y * height);
          ctx.stroke();
        }
      });
    });
  }

  // Handle window resize
  function handleResize() {
    if (canvasElement) {
      canvasElement.width = width;
      canvasElement.height = height;
    }
  }

  // Handle canvas click to initialize audio (browser autoplay policy)
  async function handleCanvasClick() {
    await audioService.resumeAudioContext();
  }

  function drawExplosions() {
    if (!gameService || !ctx) return;
    
    const explosions = gameService.getActiveExplosions();
    
    explosions.forEach(explosion => {
      explosion.particles.forEach(particle => {
        const alpha = particle.life / particle.maxLife;
        const sizeMultiplier = 0.5 + (1 - alpha) * 0.5; // Particles grow slightly as they fade
        const currentSize = particle.size * sizeMultiplier;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // Main particle with glow effect
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = currentSize * 3;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, currentSize, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add bright center core
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, currentSize * 0.4, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add outer glow ring for larger particles
        if (currentSize > 4) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.strokeStyle = particle.color;
          ctx.lineWidth = 1;
          ctx.shadowColor = particle.color;
          ctx.shadowBlur = currentSize * 4;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, currentSize * 1.5, 0, 2 * Math.PI);
          ctx.stroke();
        }
        
        ctx.restore();
      });
    });
  }

  // Reactive statement to handle prop changes
  $: if (canvasElement) {
    handleResize();
  }
</script>

<canvas 
  bind:this={canvasElement} 
  {width} 
  {height}
  class="fullscreen-canvas"
  on:click={handleCanvasClick}
></canvas>

<style>
  .fullscreen-canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: #000;
    transform: scaleX(-1); /* Mirror the canvas horizontally to match webcam */
  }
</style>