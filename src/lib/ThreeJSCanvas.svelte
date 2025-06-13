<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let canvasElement;
  let ctx;
  let animationId;

  // Component props
  export let width = 800;
  export let height = 600;
  export let poseData = null;
  export let gameActive = false;

  // Game state
  let currentTarget = null;
  let gameScore = 0;
  let targetRadius = 50; // Collision detection radius
  let hitTargetIds = new Set(); // Track which targets have been hit
  
  // Score breakdown by target type
  let scoreBreakdown = {
    hand: 0,
    head: 0,
    knee: 0
  };

  // Target tracking for data recording
  let targetHistory = []; // Track all target events
  let currentTargetData = null; // Current target recording data

  onMount(() => {
    if (canvasElement) {
      ctx = canvasElement.getContext('2d');
      animate();
    }
  });

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  });

  function animate() {
    animationId = requestAnimationFrame(animate);
    drawFrame();
  }

  function drawFrame() {
    if (!ctx) return;
    
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
    if (gameActive && currentTarget) {
      checkCollisions(data);
    }
    
    // Draw game targets and UI
    if (gameActive) {
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

  // Game functions
  const TARGET_TYPES = {
    HAND: 'hand',
    HEAD: 'head', 
    KNEE: 'knee'
  };

  const TARGET_COLORS = {
    [TARGET_TYPES.HAND]: '#ff0000', // Red for hands (matches hand landmark color)
    [TARGET_TYPES.HEAD]: '#00ff88', // Green for head (matches pose landmark color)
    [TARGET_TYPES.KNEE]: '#0000ff'  // Blue for knees (matches right hand color, but for legs)
  };

  function generateRandomTarget() {
    const types = Object.values(TARGET_TYPES);
    const targetType = types[Math.floor(Math.random() * types.length)];
    
    // Calculate 5% border margins (center 90% of screen)
    const borderX = width * 0.05;
    const borderY = height * 0.05;
    const usableWidth = width * 0.9;
    const usableHeight = height * 0.9;
    
    let x, y;
    
    // Position targets in appropriate regions within the center 90%
    switch(targetType) {
      case TARGET_TYPES.HEAD:
        // Top 1/3 of canvas within center 90%, but with 10% top border for better reachability
        const headBorderY = height * 0.1; // 10% top border for head targets
        const headUsableHeight = height * 0.8; // 80% usable height (10% top + 10% bottom margins)
        x = Math.random() * usableWidth + borderX;
        y = Math.random() * (headUsableHeight / 3) + headBorderY;
        break;
      case TARGET_TYPES.KNEE:
        // Between 1/2 and bottom 1/4 of canvas within center 90%
        x = Math.random() * usableWidth + borderX;
        y = Math.random() * (usableHeight / 4) + (borderY + 3 * usableHeight / 5); // From 60% to 75% of usable height
        break;
      case TARGET_TYPES.HAND:
      default:
        // Anywhere within center 90% of canvas
        x = Math.random() * usableWidth + borderX;
        y = Math.random() * usableHeight + borderY;
        break;
    }

    return {
      id: Date.now() + Math.random(), // Unique ID
      type: targetType,
      x: x,
      y: y,
      color: TARGET_COLORS[targetType]
    };
  }

  function checkCollisions(data) {
    if (!currentTarget || !data) return;

    let targetHit = false;
    let hitKeypoint = null;
    const targetX = currentTarget.x;
    const targetY = currentTarget.y;

    switch(currentTarget.type) {
      case TARGET_TYPES.HAND:
        // Check all landmarks in both hands for better collision detection
        if (data.leftHandLandmarks && data.leftHandLandmarks.length > 0) {
          for (let i = 0; i < data.leftHandLandmarks.length; i++) {
            const landmark = data.leftHandLandmarks[i];
            if (landmark && checkDistance(landmark.x * width, landmark.y * height, targetX, targetY)) {
              targetHit = true;
              hitKeypoint = `left_hand_${i}`;
              break;
            }
          }
        }
        if (!targetHit && data.rightHandLandmarks && data.rightHandLandmarks.length > 0) {
          for (let i = 0; i < data.rightHandLandmarks.length; i++) {
            const landmark = data.rightHandLandmarks[i];
            if (landmark && checkDistance(landmark.x * width, landmark.y * height, targetX, targetY)) {
              targetHit = true;
              hitKeypoint = `right_hand_${i}`;
              break;
            }
          }
        }
        break;
        
      case TARGET_TYPES.HEAD:
        // Check if any face landmarks are within target
        if (data.faceLandmarks && data.faceLandmarks.length > 0) {
          // Check nose center (landmark 1) as head representative
          const nose = data.faceLandmarks[1];
          if (nose && checkDistance(nose.x * width, nose.y * height, targetX, targetY)) {
            targetHit = true;
            hitKeypoint = 'face_1';
          }
        }
        // Fallback to pose landmark 0 (nose center from pose)
        if (!targetHit && data.poseLandmarks && data.poseLandmarks[0]) {
          const poseNose = data.poseLandmarks[0];
          if (poseNose && checkDistance(poseNose.x * width, poseNose.y * height, targetX, targetY)) {
            targetHit = true;
            hitKeypoint = 'pose_0';
          }
        }
        break;
        
      case TARGET_TYPES.KNEE:
        // Check both knees (pose landmarks 25 and 26)
        if (data.poseLandmarks) {
          const leftKnee = data.poseLandmarks[25];
          const rightKnee = data.poseLandmarks[26];
          
          if (leftKnee && checkDistance(leftKnee.x * width, leftKnee.y * height, targetX, targetY)) {
            targetHit = true;
            hitKeypoint = 'pose_25';
          }
          if (!targetHit && rightKnee && checkDistance(rightKnee.x * width, rightKnee.y * height, targetX, targetY)) {
            targetHit = true;
            hitKeypoint = 'pose_26';
          }
        }
        break;
    }

    if (targetHit && !hitTargetIds.has(currentTarget.id)) {
      hitTargetIds.add(currentTarget.id);
      gameScore++;
      
      // Update score breakdown by target type
      scoreBreakdown[currentTarget.type]++;
      
      // Record target hit for data collection
      if (currentTargetData) {
        currentTargetData.status = 'obtained';
        currentTargetData.hitKeypoint = hitKeypoint;
        currentTargetData.hitTime = Date.now();
        targetHistory.push({ ...currentTargetData });
      }
      
      // Generate new target after a short delay
      const hitTargetType = currentTarget.type;
      setTimeout(() => {
        // End previous target
        if (currentTargetData) {
          currentTargetData.status = 'end';
          targetHistory.push({ ...currentTargetData });
        }
        
        // Create new target
        currentTarget = generateRandomTarget();
        createTargetData();
        dispatch('targetChanged', { targetType: currentTarget.type });
      }, 100);
      
      // Dispatch score update with breakdown
      dispatch('scoreUpdate', { 
        score: gameScore, 
        targetType: hitTargetType,
        scoreBreakdown: { ...scoreBreakdown },
        hitKeypoint: hitKeypoint
      });
    }
    
    // Emit current target data for recording
    emitTargetData();
  }

  function checkDistance(x1, y1, x2, y2) {
    const distance = Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
    return distance <= targetRadius;
  }

  function createTargetData() {
    if (!currentTarget) return;
    
    currentTargetData = {
      targetShowing: true,
      targetId: currentTarget.id,
      targetType: currentTarget.type,
      targetX: currentTarget.x,
      targetY: currentTarget.y,
      status: 'start',
      startTime: Date.now(),
      hitKeypoint: null,
      hitTime: null
    };
    
    // Record target start
    targetHistory.push({ ...currentTargetData });
    currentTargetData.status = 'unobtained';
  }

  function emitTargetData() {
    // Create target data for current frame
    const targetData = currentTargetData ? {
      targetShowing: !!currentTarget,
      targetId: currentTargetData.targetId,
      targetType: currentTargetData.targetType,
      targetX: currentTargetData.targetX,
      targetY: currentTargetData.targetY,
      status: currentTargetData.status
    } : {
      targetShowing: false,
      targetId: null,
      targetType: null,
      targetX: null,
      targetY: null,
      status: null
    };
    
    // Dispatch for recording
    dispatch('targetDataUpdate', targetData);
  }

  function startGame() {
    gameScore = 0;
    hitTargetIds.clear();
    scoreBreakdown = { hand: 0, head: 0, knee: 0 };
    targetHistory = [];
    currentTarget = generateRandomTarget();
    createTargetData();
    dispatch('gameStarted', { score: gameScore, scoreBreakdown: { ...scoreBreakdown } });
    dispatch('targetChanged', { targetType: currentTarget.type });
  }

  function stopGame() {
    // End current target if exists
    if (currentTargetData) {
      currentTargetData.status = 'end';
      targetHistory.push({ ...currentTargetData });
    }
    
    currentTarget = null;
    currentTargetData = null;
    dispatch('gameEnded', { finalScore: gameScore, targetHistory: [...targetHistory] });
  }

  // Reactive statement to handle game state changes
  $: if (gameActive && !currentTarget) {
    startGame();
  } else if (!gameActive && currentTarget) {
    stopGame();
  }

  function drawGameElements() {
    if (!ctx || !currentTarget) return;
    
    // Draw target
    drawTarget(currentTarget);
    
    // Note: Game UI (score) moved to webcam panel
  }

  function drawTarget(target) {
    if (!ctx) return;
    
    const { x, y, color, type } = target;
    
    // Draw target circle with glow effect
    ctx.save();
    
    // Outer glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, targetRadius, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Inner circle
    ctx.shadowBlur = 0;
    ctx.fillStyle = color + '40'; // Semi-transparent
    ctx.beginPath();
    ctx.arc(x, y, targetRadius - 10, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw icon based on target type
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial'; // Increased from 24px to 36px for better visibility
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let icon = '';
    switch(type) {
      case TARGET_TYPES.HAND:
        icon = '✋'; // Hand emoji
        break;
      case TARGET_TYPES.HEAD:
        icon = '😀'; // Head emoji
        break;
      case TARGET_TYPES.KNEE:
        icon = '🦵'; // Leg emoji
        break;
    }
    
    ctx.fillText(icon, x, y);
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
            ctx.strokeStyle = '#0000ff'; // Blue for legs
          } else if (armLandmarks.has(startIdx) && armLandmarks.has(endIdx)) {
            ctx.strokeStyle = '#ff0000'; // Red for arms
          } else if (headLandmarks.has(startIdx) || headLandmarks.has(endIdx)) {
            ctx.strokeStyle = '#00ff88'; // Green for head connections
          } else {
            ctx.strokeStyle = '#888888'; // Grey for torso and other connections
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
          ctx.fillStyle = '#00ff88'; // Green for head
        } else if (legLandmarks.has(index)) {
          ctx.fillStyle = '#0000ff'; // Blue for legs
        } else if (armLandmarks.has(index)) {
          ctx.fillStyle = '#ff0000'; // Red for arms
        } else {
          ctx.fillStyle = '#888888'; // Grey for other points
        }
        
        ctx.beginPath();
        ctx.arc(landmark.x * width, landmark.y * height, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }

  function drawHandLandmarks(landmarks, hand) {
    if (!landmarks || landmarks.length === 0) return;
    
    const color = '#ff0000'; // Red for both hands to match target color
    
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
      // mouthOuter: [61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
      mouthOuter: [324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
      
      // Mouth inner opening (simplified for clear lines) 
      mouthInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 324]
    };
    
    // Draw each facial feature with green color to match head target
    const featureColors = {
      faceContour: '#00ff88',
      leftEyebrow: '#00ff88',
      rightEyebrow: '#00ff88', 
      leftEye: '#00ff88',
      rightEye: '#00ff88',
      nose: '#00ff88',
      mouthOuter: '#00ff88',
      mouthInner: '#00ff88'
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
        ctx.strokeStyle = '#00ff88'; // Green for eyes to match head target
        ctx.lineWidth = 1;
      } else if (featureName.includes('Eyebrow')) {
        ctx.strokeStyle = '#00ff88'; // Green for eyebrows to match head target
        ctx.lineWidth = 1;
      } else if (featureName.includes('mouth')) {
        ctx.strokeStyle = '#00ff88'; // Green for mouth to match head target
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