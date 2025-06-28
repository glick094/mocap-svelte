<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { GameService, GAME_MODES, TARGET_TYPES, type GameMode } from '../services/gameService';
  import { gameColors, poseColors, hipSwaySettings } from '../stores/themeStore';
  import { gameSettings } from '../stores/gameStore';
  import { audioService } from '../services/audioService';

  const dispatch = createEventDispatcher<{
    targetHit: { type: string; score: number };
    gameComplete: { score: number; totalTargets: number };
    gameDataUpdate: any;
    scoreUpdate: any;
    gameEnded: any;
    targetChanged: any;
    targetDataUpdate: any;
    gameStarted: any;
  }>();

  let canvasElement: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  let animationId: number;
  let gameService: GameService;

  // Component props
  export let width: number = 800;
  export let height: number = 600;
  export let poseData: any = null;
  export let gameActive: boolean = false;
  export let gameMode: string = 'hips-sway';
  export const gameModeProgress = { completed: 0, total: 8 };
  export let gameFlowState: any = null;

  onMount(() => {
    if (canvasElement) {
      ctx = canvasElement.getContext('2d');
      gameService = new GameService(width, height, gameMode as GameMode);
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

  function drawPoseVisualization(data: any): void {
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
    
    // Draw delay visuals or game elements
    if (gameFlowState && gameFlowState.phase === 'delay') {
      drawDelayVisuals();
    } else if (gameActive && gameService) {
      drawGameElements();
    }
  }

  function emitGameData(data: any): void {
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

  function handleCollision(collisionResult: any): void {
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
    
    // Check if game is complete using the game service method
    if (gameService.isGameComplete()) {
      setTimeout(() => {
        dispatch('gameEnded', { 
          finalScore: gameService.getGameScore(), 
          completed: true,
          targetHistory: gameService.getTargetHistory()
        });
      }, 500); // Reduced delay for faster flow
    }
    
    // For random mode, dispatch target change
    const currentTarget = gameService.getCurrentTarget();
    if (gameMode === GAME_MODES.RANDOM && currentTarget) {
      dispatch('targetChanged', { targetType: currentTarget.type });
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

  // Update game service when dimensions or mode change (must happen first)
  $: if (gameService) {
    gameService.updateDimensions(width, height);
    gameService.updateGameMode(gameMode as GameMode);
  }
  
  // Reactive statement to handle game state changes (depends on mode being set)
  $: if (gameActive && gameService && !gameService.getCurrentTarget()) {
    startGame();
  } else if (!gameActive && gameService && gameService.getCurrentTarget()) {
    stopGame();
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
        drawHandsFixedGame();
        break;
      case GAME_MODES.HEAD_FIXED:
        drawHeadFixedGame();
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
    if (!gameService || !ctx) return;
    
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
        // NOTE: Canvas is flipped, so we need to reverse the color assignment
        // When targeting 'left', we want leftRegion (which appears visually right) to use hipRight color
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
        // NOTE: Canvas is flipped, so leftRegion is visually on the right, rightRegion is visually on the left
        ctx.globalAlpha = 0.2;
        
        ctx.fillStyle = $gameColors.hipRight; // leftRegion appears on visual right due to flip
        ctx.fillRect(
          hipRegions.leftRegion.x,
          hipRegions.leftRegion.y,
          hipRegions.leftRegion.width,
          hipRegions.leftRegion.height
        );
        
        ctx.fillStyle = $gameColors.hipLeft; // rightRegion appears on visual left due to flip
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
          $gameSettings.hipSwayTextPrompts.targeting.instruction(hipSwayState.targetSide || 'center'),
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
  
  function drawHandsFixedGame() {
    if (!gameService || !ctx) return;
    
    const handsCenteringState = gameService.getHandsCenteringState();
    
    switch (handsCenteringState.phase) {
      case 'centering':
        drawHandsCenteringPhase(handsCenteringState);
        break;
      case 'targeting':
        drawFixedTargets();
        break;
      case 'completed':
        drawFixedTargets();
        break;
    }
  }
  
  function drawHeadFixedGame() {
    if (!gameService || !ctx) return;
    
    const headCenteringState = gameService.getHeadCenteringState();
    
    switch (headCenteringState.phase) {
      case 'centering':
        drawHeadCenteringPhase(headCenteringState);
        break;
      case 'targeting':
        drawFixedTargets();
        break;
      case 'completed':
        drawFixedTargets();
        break;
    }
  }

  function drawHandsCenteringPhase(handsState: any): void {
    if (!ctx) return;
    
    ctx.save();
    
    const tolerance = handsState.centeringTolerance;
    const crossSize = tolerance * 0.5;
    
    // Determine which hand to show based on trial state
    const activeHand = handsState.activeHand;
    const primaryHand = handsState.primaryHand;
    
    if (primaryHand === null) {
      // Show both centers during primary hand detection
      drawHandCenter('left', handsState.leftCenterX, handsState.leftCenterY, tolerance, crossSize, false, false);
      drawHandCenter('right', handsState.rightCenterX, handsState.rightCenterY, tolerance, crossSize, false, false);
    } else if (activeHand) {
      // Show only the active hand's center (flip positions due to canvas flip)
      // When activeHand is 'left', user uses left hand, so show circle on left side (rightCenterX)
      // When activeHand is 'right', user uses right hand, so show circle on right side (leftCenterX)
      const centerX = activeHand === 'left' ? handsState.rightCenterX : handsState.leftCenterX;
      const centerY = activeHand === 'left' ? handsState.rightCenterY : handsState.leftCenterY;
      drawHandCenter(activeHand, centerX, centerY, tolerance, crossSize, true, handsState.isCentered);
    }
    
    ctx.restore();
    
    // Draw instruction text (flip back to correct orientation)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    
    if (primaryHand === null) {
      ctx.fillText(
        'Touch either center cross to select primary hand',
        -width / 2,
        50
      );
    } else {
      const trialText = handsState.currentTrial === 1 ? 'Primary Hand Trial' : 'Secondary Hand Trial';
      // The activeHand already represents the correct physical hand
      const handText = activeHand === 'left' ? 'Right Hand': 'Left Hand';
      ctx.fillText(
        `${trialText}: ${handText}`,
        -width / 2,
        50
      );
    }
    
    ctx.fillStyle = '#cccccc';
    ctx.font = '18px Arial';
    if (handsState.isCentered) {
      ctx.fillText(
        'Hold position for 2 seconds...',
        -width / 2,
        height - 30
      );
    } else if (primaryHand === null) {
      ctx.fillText(
        'The first hand to touch a center will be your primary hand',
        -width / 2,
        height - 30
      );
    } else {
      // The activeHand already represents the correct physical hand
      ctx.fillText(
        `Position your ${activeHand} hand on the center cross`,
        -width / 2,
        height - 30
      );
    }
    ctx.restore();
  }
  
  function drawHandCenter(hand: 'left' | 'right', centerX: number, centerY: number, tolerance: number, crossSize: number, isActive: boolean, isCentered: boolean): void {
    if (!ctx) return;
    
    // Use hand-specific colors
    const handColor = hand === 'left' ? $gameColors.hipLeft : $gameColors.hipRight; // Orange for left, reddish purple for right
    const statusColor = isCentered ? '#00ff00' : (isActive ? handColor : '#666666');
    
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = isActive ? 6 : 3;
    ctx.globalAlpha = isActive ? 0.9 : 0.5;
    
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(centerX - crossSize, centerY);
    ctx.lineTo(centerX + crossSize, centerY);
    ctx.stroke();
    
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - crossSize);
    ctx.lineTo(centerX, centerY + crossSize);
    ctx.stroke();
    
    // Draw tolerance circle
    ctx.globalAlpha = isActive ? 0.3 : 0.1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, tolerance, 0, 2 * Math.PI);
    ctx.stroke();
  }
  
  function drawHeadCenteringPhase(headState: any): void {
    if (!ctx) return;
    
    ctx.save();
    
    // Draw center cross for head
    const centerX = headState.centerX;
    const centerY = headState.centerY;
    const tolerance = headState.centeringTolerance;
    const crossSize = tolerance * 0.5; // Make cross smaller than tolerance
    
    ctx.strokeStyle = headState.isCentered ? '#00ff00' : '#00ff88'; // Bright green when centered, regular green otherwise
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.8;
    
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(centerX - crossSize, centerY);
    ctx.lineTo(centerX + crossSize, centerY);
    ctx.stroke();
    
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - crossSize);
    ctx.lineTo(centerX, centerY + crossSize);
    ctx.stroke();
    
    // Draw tolerance circle (faint)
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, tolerance, 0, 2 * Math.PI);
    ctx.stroke();
    
    ctx.restore();
    
    // Draw instruction text (flip back to correct orientation)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Position your head on the cross',
      -width / 2,
      50
    );
    
    ctx.fillStyle = '#cccccc';
    ctx.font = '18px Arial';
    if (headState.isCentered) {
      ctx.fillText(
        'Hold position for 2 seconds...',
        -width / 2,
        height - 30
      );
    } else {
      ctx.fillText(
        'Move your head to the center cross',
        -width / 2,
        height - 30
      );
    }
    ctx.restore();
  }

  function drawFixedTargets() {
    if (!gameService || !ctx) return;
    
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
        ctx!.save();
        ctx!.globalAlpha = 0.3;
        drawTarget(target, false);
        ctx!.restore();
      } else {
        // Draw upcoming targets dimmed
        ctx!.save();
        ctx!.globalAlpha = 0.1;
        drawTarget(target, false);
        ctx!.restore();
      }
    });
    
    // Draw progress text (flip back to correct orientation)
    ctx.save();
    ctx.scale(-1, 1); // Counter-flip the text horizontally
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    
    // Show trial-specific progress for hands game
    if (gameMode === GAME_MODES.HANDS_FIXED) {
      const handsState = gameService.getHandsCenteringState();
      const trialText = handsState.currentTrial === 1 ? 'Primary Hand Trial' : 'Secondary Hand Trial';
      // The activeHand already represents the correct physical hand
      const handText = handsState.activeHand === 'left' ? 'Left Hand' : 'Right Hand';
      ctx.fillText(
        `${trialText}: ${handText} - ${currentFixedTargetIndex}/${fixedTargets.length}`,
        -width / 2, // Negative x because we flipped
        50
      );
    } else {
      ctx.fillText(
        `Progress: ${currentFixedTargetIndex}/${fixedTargets.length}`,
        -width / 2, // Negative x because we flipped
        50
      );
    }
    ctx.restore();
  }

  function drawTarget(target: any, highlighted: boolean = false): void {
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
    ctx.font = 'bold 50px Arial';
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

  function drawPoseLandmarks(landmarks: any): void {
    if (!landmarks || landmarks.length === 0 || !ctx) return;
    
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
    const headLandmarks = new Set([0]); // Nose center - used for head tracking
    const hipLandmarks = new Set([23, 24]); // Hip landmarks - used for hip sway tracking
    const kneeLandmarks = new Set([25, 26]); // Knee landmarks - used for knee tracking
    
    // Draw connections first (behind landmarks)
    ctx.lineWidth = 3;
    
    connections.forEach(([startIdx, endIdx]) => {
      if (startIdx < landmarks.length && endIdx < landmarks.length &&
          !excludedIndices.has(startIdx) && !excludedIndices.has(endIdx)) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        
        if (start.visibility > 0.5 && end.visibility > 0.5) {
          // Color code connections based on body parts and tracking importance
          if (hipLandmarks.has(startIdx) && hipLandmarks.has(endIdx)) {
            // Hip connection - NOTE: Canvas is flipped, so 23=right hip visually, 24=left hip visually
            if (startIdx === 23 || endIdx === 23) {
              ctx!.strokeStyle = $gameColors.hipRight; // Landmark 23 = visually right hip (due to flip)
            } else {
              ctx!.strokeStyle = $gameColors.hipLeft; // Landmark 24 = visually left hip (due to flip)
            }
          } else if (kneeLandmarks.has(startIdx) || kneeLandmarks.has(endIdx)) {
            ctx!.strokeStyle = $gameColors.knee; // Knee tracking color
          } else if (headLandmarks.has(startIdx) || headLandmarks.has(endIdx)) {
            ctx!.strokeStyle = $gameColors.head; // Head tracking color
          } else {
            // All other connections (shoulders, feet, arms) are grey
            ctx!.strokeStyle = '#999999';
          }
          
          ctx!.beginPath();
          ctx!.moveTo(start.x * width, start.y * height);
          ctx!.lineTo(end.x * width, end.y * height);
          ctx!.stroke();
        }
      }
    });
    
    // Draw landmark points (excluding face points 1-10) with color coding based on tracking importance
    landmarks.forEach((landmark: any, index: number) => {
      if (!excludedIndices.has(index) && landmark.visibility && landmark.visibility > 0.5) {
        // Color code landmarks based on their role in collision detection
        if (headLandmarks.has(index)) {
          ctx!.fillStyle = $gameColors.head; // Head tracking color (matches head targets)
        } else if (index === 23) {
          // NOTE: Canvas is flipped, so landmark 23 = visually right hip
          ctx!.fillStyle = $gameColors.hipRight; // Visually right hip
        } else if (index === 24) {
          // NOTE: Canvas is flipped, so landmark 24 = visually left hip
          ctx!.fillStyle = $gameColors.hipLeft; // Visually left hip
        } else if (index === 25 || index === 26) {
          ctx!.fillStyle = $gameColors.knee; // Knee tracking color (matches knee targets)
        } else {
          // All other points (shoulders, feet, arms) are grey
          ctx!.fillStyle = '#999999';
        }
        
        // Use larger radius for tracking keypoints to make them more visible
        // Hip points get extra large radius for hip sway game
        let radius = 6; // Default size
        if (headLandmarks.has(index) || index === 25 || index === 26) {
          radius = 8; // Larger for head and knee tracking
        } else if (index === 23 || index === 24) {
          radius = 10; // Extra large for hip tracking
        }
        
        ctx!.beginPath();
        ctx!.arc(landmark.x * width, landmark.y * height, radius, 0, 2 * Math.PI);
        ctx!.fill();
      }
    });
  }

  function drawHandLandmarks(landmarks: any, hand: any): void {
    if (!landmarks || landmarks.length === 0 || !ctx) return;
    
    // In random mode, both hands should be red to match the target color
    // In other modes, use specific colors for left and right hands
    const color = gameMode === GAME_MODES.RANDOM 
      ? $gameColors.hand 
      : (hand === 'left' ? $poseColors.leftHand : $poseColors.rightHand);
    
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
        
        ctx!.beginPath();
        ctx!.moveTo(start.x * width, start.y * height);
        ctx!.lineTo(end.x * width, end.y * height);
        ctx!.stroke();
      }
    });
    
    // Draw landmark points
    ctx.fillStyle = color;
    landmarks.forEach((landmark: any) => {
      ctx!.beginPath();
      ctx!.arc(landmark.x * width, landmark.y * height, 4, 0, 2 * Math.PI);
      ctx!.fill();
    });
  }

  function drawFaceLandmarks(landmarks: any): void {
    if (!landmarks || landmarks.length === 0 || !ctx) return;
    
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
    const featureColors: { [key: string]: string } = {
      faceContour: faceColor,
      leftEyebrow: faceColor,
      rightEyebrow: faceColor, 
      leftEye: faceColor,
      rightEye: faceColor,
      nose: faceColor,
      mouthOuter: faceColor,
      mouthInner: faceColor
    };
    
    const featureSizes: { [key: string]: number } = {
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
      ctx!.fillStyle = featureColors[featureName];
      const pointSize = featureSizes[featureName];
      
      indices.forEach((index) => {
        if (index < landmarks.length) {
          const landmark = landmarks[index];
          ctx!.beginPath();
          ctx!.arc(landmark.x * width, landmark.y * height, pointSize, 0, 2 * Math.PI);
          ctx!.fill();
        }
      });
    });
    
    // Draw connections for key features
    drawFaceConnections(landmarks, facialFeatures);
  }

  function drawFaceConnections(landmarks: any, facialFeatures: any): void {
    if (!ctx) return;
    // Define connections for key facial features
    const connections = {
      leftEyebrow: facialFeatures.leftEyebrow.map((_: any, i: number, arr: any[]) => 
        i < arr.length - 1 ? [arr[i], arr[i + 1]] : null
      ).filter(Boolean),
      
      rightEyebrow: facialFeatures.rightEyebrow.map((_: any, i: number, arr: any[]) => 
        i < arr.length - 1 ? [arr[i], arr[i + 1]] : null
      ).filter(Boolean),
      
      leftEye: [...facialFeatures.leftEye.map((_: any, i: number, arr: any[]) => 
        [arr[i], arr[(i + 1) % arr.length]]
      )],
      
      rightEye: [...facialFeatures.rightEye.map((_: any, i: number, arr: any[]) => 
        [arr[i], arr[(i + 1) % arr.length]]
      )],
      
      // Connect mouth inner as individual line segments
      mouthInner: facialFeatures.mouthInner.map((_: any, i: number, arr: any[]) => 
        i < arr.length - 1 ? [arr[i], arr[i + 1]] : null
      ).filter(Boolean)
    };
    
    // Draw connections
    Object.entries(connections).forEach(([featureName, featureConnections]) => {
      if (featureName.includes('Eye')) {
        ctx!.strokeStyle = $poseColors.face;
        ctx!.lineWidth = 1;
      } else if (featureName.includes('Eyebrow')) {
        ctx!.strokeStyle = $poseColors.face;
        ctx!.lineWidth = 1;
      } else if (featureName.includes('mouth')) {
        ctx!.strokeStyle = $poseColors.face;
        ctx!.lineWidth = 3;
      }
      
      featureConnections.forEach(([startIdx, endIdx]: [number, number]) => {
        if (startIdx < landmarks.length && endIdx < landmarks.length) {
          const start = landmarks[startIdx];
          const end = landmarks[endIdx];
          
          ctx!.beginPath();
          ctx!.moveTo(start.x * width, start.y * height);
          ctx!.lineTo(end.x * width, end.y * height);
          ctx!.stroke();
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
        
        ctx!.save();
        ctx!.globalAlpha = alpha;
        
        // Main particle with glow effect
        ctx!.fillStyle = particle.color;
        ctx!.shadowColor = particle.color;
        ctx!.shadowBlur = currentSize * 3;
        
        ctx!.beginPath();
        ctx!.arc(particle.x, particle.y, currentSize, 0, 2 * Math.PI);
        ctx!.fill();
        
        // Add bright center core
        ctx!.shadowBlur = 0;
        ctx!.globalAlpha = alpha * 0.8;
        ctx!.fillStyle = '#ffffff';
        ctx!.beginPath();
        ctx!.arc(particle.x, particle.y, currentSize * 0.4, 0, 2 * Math.PI);
        ctx!.fill();
        
        // Add outer glow ring for larger particles
        if (currentSize > 4) {
          ctx!.globalAlpha = alpha * 0.3;
          ctx!.strokeStyle = particle.color;
          ctx!.lineWidth = 1;
          ctx!.shadowColor = particle.color;
          ctx!.shadowBlur = currentSize * 4;
          ctx!.beginPath();
          ctx!.arc(particle.x, particle.y, currentSize * 1.5, 0, 2 * Math.PI);
          ctx!.stroke();
        }
        
        ctx!.restore();
      });
    });
  }

  function drawDelayVisuals() {
    if (!ctx || !gameFlowState) return;
    
    // Get the next game mode (during delay, we want to show what's coming next)
    const gameSequence = [GAME_MODES.HIPS_SWAY, GAME_MODES.HANDS_FIXED, GAME_MODES.HEAD_FIXED, GAME_MODES.RANDOM];
    const nextGameIndex = gameFlowState.currentGameIndex + 1;
    const nextGame = nextGameIndex < gameSequence.length ? gameSequence[nextGameIndex] : null;
    
    if (!nextGame) return; // No next game to show
    
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.15; // 15% of smaller dimension
    
    // Calculate progress (0 to 1)
    const totalDelay = 15000; // 10 seconds
    const progress = 1 - (gameFlowState.delayRemaining / totalDelay);
    
    ctx.save();
    // Apply horizontal flip to match the rest of the canvas
    ctx.scale(-1, 1);
    
    // Draw countdown circle timer
    ctx.globalAlpha = 0.8;
    
    // Background circle
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(-centerX, centerY, radius, 0, 2 * Math.PI); // Negative X due to flip
    ctx.stroke();
    
    // Progress circle (counts down)
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Start from top (-π/2) and draw clockwise, but reverse progress for countdown
    const endAngle = -Math.PI / 2 + (1 - progress) * 2 * Math.PI;
    ctx.arc(-centerX, centerY, radius, -Math.PI / 2, endAngle); // Negative X due to flip
    ctx.stroke();
    
    // Draw countdown number in center
    const secondsRemaining = Math.ceil(gameFlowState.delayRemaining / 1000);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Arial'; // Increased size
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(secondsRemaining.toString(), -centerX, centerY); // Negative X due to flip
    
    // Draw next game mode text
    const nextGameText = $gameSettings.gameModeTexts.displayNames[nextGame] || 'GAME';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial'; // Increased size
    ctx.textAlign = 'center';
    ctx.fillText(`Next: ${nextGameText}`, -centerX, centerY - radius - 100); // Negative X due to flip
    
    // Draw task description
    const taskDescription = $gameSettings.gameModeTexts.descriptions[nextGame] || 'Follow the on-screen instructions';
    ctx.fillStyle = '#cccccc';
    ctx.font = '32px Arial'; // Increased size
    ctx.textAlign = 'center';
    ctx.fillText(taskDescription, -centerX, centerY - radius - 50); // Negative X due to flip
    
    ctx.restore();
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