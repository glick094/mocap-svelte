<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { GameService, GAME_MODES, TARGET_TYPES, type GameMode } from '../services/gameService';
  import { gameColors, poseColors, hipSwaySettings } from '../stores/themeStore';
  import { gameSettings } from '../stores/gameStore';
  import { audioService } from '../services/audioService';
  import * as THREE from 'three';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

  // Three.js variables
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer | null = null;
  let characterModel: THREE.Group | null = null;
  let poseGroup: THREE.Group;
  let bones: { [key: string]: THREE.Bone } = {};
  let gltfLoader: GLTFLoader;
  
  // Component props
  export let width: number = 800;
  export let height: number = 600;
  export let poseData: any = null;
  export let gameActive: boolean = false;
  export let gameMode: string = 'hips-sway';
  export const gameModeProgress = { completed: 0, total: 8 };
  export let gameFlowState: any = null;
  export let visualizationMode: 'basic' | 'advanced' = 'basic';
  
  let isThreeJSInitialized = false;
  let previousMode = visualizationMode;

  onMount(() => {
    if (canvasElement) {
      if (visualizationMode === 'basic') {
        initializeCanvas();
      } else {
        initializeThreeJS();
      }
      gameService = new GameService(width, height, gameMode as GameMode);
      animate();
    }
  });

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    if (renderer) {
      renderer.dispose();
    }
    audioService.destroy();
  });

  // Reactive statement to handle mode changes
  $: if (canvasElement && visualizationMode !== previousMode) {
    switchVisualizationMode();
    previousMode = visualizationMode;
  }

  function switchVisualizationMode() {
    // Clean up previous mode
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    
    if (visualizationMode === 'basic') {
      // Switch to 2D canvas
      if (renderer) {
        renderer.dispose();
        renderer = null;
      }
      // Clear any WebGL context
      const gl = canvasElement.getContext('webgl') || canvasElement.getContext('experimental-webgl');
      if (gl) {
        const loseContext = gl.getExtension('WEBGL_lose_context');
        if (loseContext) {
          loseContext.loseContext();
        }
      }
      initializeCanvas();
    } else {
      // Switch to 3D Three.js
      ctx = null;
      // Force recreate canvas element to clear any existing context
      recreateCanvas();
      initializeThreeJS();
    }
    
    // Restart animation loop
    animate();
  }

  function recreateCanvas() {
    // Store current canvas properties
    const currentWidth = canvasElement.width;
    const currentHeight = canvasElement.height;
    const currentClassName = canvasElement.className;
    
    // Create new canvas element
    const newCanvas = document.createElement('canvas');
    newCanvas.width = currentWidth;
    newCanvas.height = currentHeight;
    newCanvas.className = currentClassName;
    
    // Replace the old canvas
    canvasElement.parentNode?.replaceChild(newCanvas, canvasElement);
    canvasElement = newCanvas;
  }

  function initializeCanvas() {
    ctx = canvasElement.getContext('2d');
    isThreeJSInitialized = false;
  }
  
  async function initializeThreeJS() {
    try {
      // Check WebGL support first
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        throw new Error('WebGL is not supported in this browser');
      }
      
      // Create scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      
      // Create camera with better positioning
      camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(0, 1.5, 4); // Move camera back and up slightly
      camera.lookAt(0, 1, 0);
      
      // Create renderer with better WebGL context options
      renderer = new THREE.WebGLRenderer({ 
        canvas: canvasElement, 
        antialias: false, // Disable for better compatibility
        alpha: false,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false,
        stencil: false,
        depth: true
      });
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = false; // Disable shadows for better compatibility
    
    // Add better lighting setup
    const ambientLight = new THREE.AmbientLight(0x404040, 0.8); // Increased ambient light
    scene.add(ambientLight);
    
    // Key light (main illumination)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(5, 10, 5);
    keyLight.castShadow = false; // Disabled shadows for compatibility
    scene.add(keyLight);
    
    // Fill light (reduce shadows)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, 5, 2);
    scene.add(fillLight);
    
    // Back light (rim lighting)
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(0, 5, -5);
    scene.add(backLight);
    
    // Create pose group for basic mode fallback in 3D space
    poseGroup = new THREE.Group();
    scene.add(poseGroup);
    
    // Load GLB model
    gltfLoader = new GLTFLoader();
    try {
      const gltf = await gltfLoader.loadAsync('/src/assets/phil.glb');
      characterModel = gltf.scene;
      characterModel.scale.set(1, 1, 1);
      characterModel.position.set(0, 0, 0);
      
      // Fix materials and extract bones
      console.log('Starting material replacement...');
      characterModel.traverse((child) => {
        if (child instanceof THREE.Bone) {
          bones[child.name] = child;
        }
        
        // Replace ALL materials with simple ones to fix shader errors
        if (child instanceof THREE.Mesh) {
          const mesh = child as THREE.Mesh;
          console.log(`Processing mesh: ${mesh.name || 'unnamed'}, material:`, mesh.material);
          
          // Define material colors based on mesh name for better appearance
          const materialColors: { [key: string]: number } = {
            'shirt': 0x4CAF50,     // Green
            'pants': 0x2196F3,     // Blue  
            'shoes': 0x424242,     // Dark gray
            'skin': 0xFFDBB3,      // Skin tone
            'hair': 0x8D6E63,      // Brown
            'face': 0xFFDBB3,      // Skin tone
            'head': 0xFFDBB3,      // Skin tone
            'body': 0xFFDBB3,      // Skin tone
            'default': 0x888888    // Gray fallback
          };
          
          // Determine color based on mesh name
          let color = materialColors.default;
          const meshName = (mesh.name || '').toLowerCase();
          
          for (const [partName, partColor] of Object.entries(materialColors)) {
            if (meshName.includes(partName)) {
              color = partColor;
              break;
            }
          }
          
          // Force replace with simple material - no exceptions
          mesh.material = new THREE.MeshLambertMaterial({
            color: color,
            transparent: false,
            opacity: 1.0
          });
          
          console.log(`Replaced material for ${mesh.name || 'unnamed'} with color:`, color.toString(16));
        }
      });
      
      console.log('Material replacement completed');
      
      scene.add(characterModel);
      
      // Force one more cleanup pass after adding to scene
      setTimeout(() => {
        console.log('Performing final material cleanup...');
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh && child.parent === characterModel) {
            if (!(child.material instanceof THREE.MeshLambertMaterial)) {
              console.log('Found non-Lambert material after load, replacing:', child.name);
              child.material = new THREE.MeshLambertMaterial({
                color: 0x888888
              });
            }
          }
        });
      }, 100);
      
      console.log('Character model loaded successfully with simplified materials');
      console.log('Available bones:', Object.keys(bones));
      
    } catch (error) {
      console.error('Error loading character model:', error);
      // Fallback to basic 3D pose visualization
      createBasic3DPose();
    }
    
    isThreeJSInitialized = true;
    } catch (error) {
      console.error('Error initializing Three.js:', error);
      console.warn('Falling back to basic 2D visualization mode');
      // Fall back to 2D canvas mode
      visualizationMode = 'basic';
      isThreeJSInitialized = false;
      initializeCanvas();
      
      // Show user notification about the fallback
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          alert('Advanced 3D mode is not supported on this device. Using basic 2D visualization instead.');
        }, 1000);
      }
    }
  }
  
  function createBasic3DPose() {
    // Create basic 3D stick figure as fallback
    const geometry = new THREE.SphereGeometry(0.02);
    const material = new THREE.MeshBasicMaterial({ color: 0xff6b6b });
    
    // Create joint spheres that will be positioned by pose data
    for (let i = 0; i < 33; i++) {
      const joint = new THREE.Mesh(geometry, material.clone());
      joint.name = `joint_${i}`;
      poseGroup.add(joint);
    }
    
    // Create connections between joints
    const connections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24],
      [23, 25], [25, 27], [27, 29], [29, 31],
      [24, 26], [26, 28], [28, 30], [30, 32]
    ];
    
    connections.forEach(([start, end]) => {
      const points = [new THREE.Vector3(), new THREE.Vector3()];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x999999 }));
      line.name = `connection_${start}_${end}`;
      poseGroup.add(line);
    });
  }

  function animate() {
    animationId = requestAnimationFrame(animate);
    
    if (visualizationMode === 'basic') {
      drawFrame();
    } else if (isThreeJSInitialized && renderer) {
      renderThreeJS();
    }
  }

  function renderThreeJS() {
    if (!renderer || !scene || !camera) return;
    
    // Update pose data in 3D space
    if (poseData) {
      updateThreeJSPose(poseData);
    }
    
    // Render the scene
    renderer.render(scene, camera);
  }

  function updateThreeJSPose(data: any) {
    if (!scene || !data.poseLandmarks) return;
    
    // Update pose landmarks in 3D space
    data.poseLandmarks.forEach((landmark: any, index: number) => {
      if (landmark.visibility > 0.5) {
        const joint = scene.getObjectByName(`joint_${index}`);
        if (joint) {
          // Convert MediaPipe coordinates to 3D space
          // MediaPipe coordinates are normalized (0-1), we need to convert to 3D space
          joint.position.set(
            (landmark.x - 0.5) * 4, // Scale and center X
            (0.5 - landmark.y) * 3, // Scale and flip Y (MediaPipe Y is inverted)
            -landmark.z * 2 // Scale Z depth
          );
        }
      }
    });
    
    // Update bone connections
    const connections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24],
      [23, 25], [25, 27], [27, 29], [29, 31],
      [24, 26], [26, 28], [28, 30], [30, 32]
    ];
    
    connections.forEach(([start, end]) => {
      const line = scene.getObjectByName(`connection_${start}_${end}`);
      if (line && data.poseLandmarks[start] && data.poseLandmarks[end]) {
        const startLandmark = data.poseLandmarks[start];
        const endLandmark = data.poseLandmarks[end];
        
        if (startLandmark.visibility > 0.5 && endLandmark.visibility > 0.5) {
          const geometry = (line as THREE.Line).geometry as THREE.BufferGeometry;
          const positions = geometry.attributes.position;
          
          // Update line positions
          positions.setXYZ(0, 
            (startLandmark.x - 0.5) * 4,
            (0.5 - startLandmark.y) * 3,
            -startLandmark.z * 2
          );
          positions.setXYZ(1,
            (endLandmark.x - 0.5) * 4,
            (0.5 - endLandmark.y) * 3,
            -endLandmark.z * 2
          );
          
          positions.needsUpdate = true;
        }
      }
    });
    
    // If we have a character model, update bone positions
    if (characterModel && bones) {
      updateCharacterBones(data);
    }
  }

  function updateCharacterBones(data: any) {
    // This is where we'll map MediaPipe landmarks to character bones
    // For now, this is a placeholder - we'll need to examine the actual bone structure
    if (!data.poseLandmarks || Object.keys(bones).length === 0) return;
    
    // Example bone mapping (this will need to be adjusted based on actual bone names)
    const boneMapping = {
      'Hips': 23, // Hip center
      'Spine': 11, // Shoulder center approximation
      'LeftShoulder': 11,
      'RightShoulder': 12,
      'LeftElbow': 13,
      'RightElbow': 14,
      'LeftWrist': 15,
      'RightWrist': 16,
      'LeftHip': 23,
      'RightHip': 24,
      'LeftKnee': 25,
      'RightKnee': 26,
      'LeftAnkle': 27,
      'RightAnkle': 28
    };
    
    Object.entries(boneMapping).forEach(([boneName, landmarkIndex]) => {
      const bone = bones[boneName];
      const landmark = data.poseLandmarks[landmarkIndex];
      
      if (bone && landmark && landmark.visibility > 0.5) {
        // Simple position mapping - this will need refinement
        bone.position.set(
          (landmark.x - 0.5) * 4,
          (0.5 - landmark.y) * 3,
          -landmark.z * 2
        );
      }
    });
  }

  // Keep all the existing 2D canvas drawing functions from the original file
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

  // Include all the original drawing functions (truncated for brevity)
  // These would include: drawPoseVisualization, drawPoseLandmarks, drawHandLandmarks, 
  // drawFaceLandmarks, drawGameElements, etc.

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
    
    // Draw delay visuals or game elements based on game flow state
    if (gameFlowState && gameFlowState.phase === 'delay') {
      drawDelayVisuals();
    } else if (gameActive && gameService) {
      drawGameElements();
    }
  }

  function emitGameData(data: any): void {
    const gameData = {
      poseLandmarks: data.poseLandmarks || null,
      leftHandLandmarks: data.leftHandLandmarks || null,
      rightHandLandmarks: data.rightHandLandmarks || null,
      faceLandmarks: data.faceLandmarks || null,
      timestamp: data.timestamp || Date.now()
    };
    
    dispatch('gameDataUpdate', gameData);
  }

  function handleCollision(collisionResult: any): void {
    const { hitType, modeProgress, hitKeypoint, playSound } = collisionResult;
    
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
    
    if (gameService.isGameComplete()) {
      setTimeout(() => {
        dispatch('gameEnded', { 
          finalScore: gameService.getGameScore(), 
          completed: true,
          targetHistory: gameService.getTargetHistory()
        });
      }, 500);
    }
    
    const currentTarget = gameService.getCurrentTarget();
    if (gameMode === GAME_MODES.RANDOM && currentTarget) {
      dispatch('targetChanged', { targetType: currentTarget.type });
    }
  }

  function drawPoseLandmarks(landmarks: any): void {
    if (!landmarks || landmarks.length === 0 || !ctx) return;
    
    // MediaPipe pose connections (excluding face connections)
    const connections = [
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
    
    // Use specific colors for left and right hands that match the target colors
    const color = hand === 'left' ? $poseColors.leftHand : $poseColors.rightHand;
    
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

  function drawGameElements() {
    if (!ctx || !gameService) return;
    
    // Simplified game elements drawing for basic mode
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

  function drawTarget(target: any, highlighted: boolean = false): void {
    if (!ctx) return;
    
    const { x, y, color, type } = target;
    const targetRadius = 50;
    
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

  function drawHipSwayRegions() {
    // Simplified hip sway regions for basic mode
    if (!gameService || !ctx) return;
    
    ctx.fillStyle = '#ff6b6b40';
    ctx.fillRect(50, height/3, 100, height/3);
    ctx.fillRect(width-150, height/3, 100, height/3);
  }

  function drawHandsFixedGame() {
    // Simplified hands game for basic mode
    if (!ctx || !gameService) return;
    
    ctx.fillStyle = '#00ff88';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Hands Game Active', width / 2, 50);
  }

  function drawHeadFixedGame() {
    // Simplified head game for basic mode
    if (!ctx || !gameService) return;
    
    ctx.fillStyle = '#ffaa00';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Head Game Active', width / 2, 50);
  }

  function drawExplosions() {
    if (!gameService || !ctx) return;
    
    const explosions = gameService.getActiveExplosions();
    
    explosions.forEach(explosion => {
      explosion.particles.forEach(particle => {
        const alpha = particle.life / particle.maxLife;
        const currentSize = particle.size * (0.5 + (1 - alpha) * 0.5);
        
        ctx!.save();
        ctx!.globalAlpha = alpha;
        ctx!.fillStyle = particle.color;
        ctx!.shadowColor = particle.color;
        ctx!.shadowBlur = currentSize * 3;
        
        ctx!.beginPath();
        ctx!.arc(particle.x, particle.y, currentSize, 0, 2 * Math.PI);
        ctx!.fill();
        
        ctx!.restore();
      });
    });
  }

  function drawDelayVisuals() {
    if (!ctx || !gameFlowState) return;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.15;
    
    const totalDelay = 10000;
    const progress = 1 - (gameFlowState.delayRemaining / totalDelay);
    
    ctx.save();
    ctx.globalAlpha = 0.8;
    
    // Background circle
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Progress circle
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const endAngle = -Math.PI / 2 + (1 - progress) * 2 * Math.PI;
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, endAngle);
    ctx.stroke();
    
    // Countdown number
    const secondsRemaining = Math.ceil(gameFlowState.delayRemaining / 1000);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(secondsRemaining.toString(), centerX, centerY);
    
    ctx.restore();
  }

  // Update game service when dimensions or mode change
  $: if (gameService) {
    gameService.updateDimensions(width, height);
    gameService.updateGameMode(gameMode as GameMode);
  }
  
  // Reactive statement to handle game state changes
  $: if (gameActive && gameService && !gameService.getCurrentTarget()) {
    startGame();
  } else if (!gameActive && gameService && gameService.getCurrentTarget()) {
    stopGame();
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

  // Handle window resize
  function handleResize() {
    if (canvasElement) {
      if (visualizationMode === 'basic') {
        canvasElement.width = width;
        canvasElement.height = height;
      } else if (renderer) {
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    }
  }

  // Handle canvas click to initialize audio
  async function handleCanvasClick() {
    await audioService.resumeAudioContext();
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