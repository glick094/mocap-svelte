<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { GameService, GAME_MODES, TARGET_TYPES, type GameMode } from '../services/gameService';
  import { gameColors, poseColors, hipSwaySettings } from '../stores/themeStore';
  import { gameSettings } from '../stores/gameStore';
  import { audioService } from '../services/audioService';
  import * as THREE from 'three';

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
  let webglCanvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null;
  let animationId: number;
  let gameService: GameService;

  // Three.js and mannequin variables
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer | null = null;
  let mannequin: any = null;
  let mannequinFABRIK: any = null;
  let isThreeJSInitialized = false;
  let useFABRIK = false;

  // Component props
  export let width: number = 800;
  export let height: number = 600;
  export let poseData: any = null;
  export let gameActive: boolean = false;
  export let gameMode: string = 'hips-sway';
  export const gameModeProgress = { completed: 0, total: 8 };
  export let gameFlowState: any = null;
  export let visualizationMode: 'basic' | 'advanced' = 'basic';

  onMount(() => {
    if (canvasElement) {
      // Initialize 2D context first
      ctx = canvasElement.getContext('2d');
      gameService = new GameService(width, height, gameMode as GameMode);
      
      // Switch to 3D mode if requested
      if (visualizationMode === 'advanced') {
        initializeThreeJS();
      }
      
      animate();
    }
  });

  function cleanupThreeJS() {
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    if (webglCanvas) {
      webglCanvas.remove();
      webglCanvas = null;
    }
    if (scene) {
      scene.clear();
    }
    mannequin = null;
    isThreeJSInitialized = false;
  }

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    cleanupThreeJS();
    audioService.destroy();
  });

  function create3DStickFigure() {
    const stickFigure = new THREE.Group();
    
    // Define colors for different body parts
    const colors = {
      head: 0xffdbac,      // Skin tone
      torso: 0x4a90e2,     // Blue shirt
      arms: 0xffdbac,      // Skin tone
      legs: 0x2c3e50,      // Dark pants
      joints: 0xff6b6b     // Red joints
    };
    
    // Create materials
    const materials = {
      head: new THREE.MeshLambertMaterial({ color: colors.head }),
      torso: new THREE.MeshLambertMaterial({ color: colors.torso }),
      arms: new THREE.MeshLambertMaterial({ color: colors.arms }),
      legs: new THREE.MeshLambertMaterial({ color: colors.legs }),
      joints: new THREE.MeshLambertMaterial({ color: colors.joints })
    };
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const head = new THREE.Mesh(headGeometry, materials.head);
    head.position.set(0, 1.7, 0);
    head.name = 'head';
    stickFigure.add(head);
    
    // Torso (spine)
    const torsoGeometry = new THREE.CylinderGeometry(0.05, 0.08, 0.8, 8);
    const torso = new THREE.Mesh(torsoGeometry, materials.torso);
    torso.position.set(0, 1, 0);
    torso.name = 'torso';
    stickFigure.add(torso);
    
    // Shoulders
    const shoulderGeometry = new THREE.SphereGeometry(0.04, 8, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeometry, materials.joints);
    leftShoulder.position.set(-0.2, 1.3, 0);
    leftShoulder.name = 'leftShoulder';
    stickFigure.add(leftShoulder);
    
    const rightShoulder = new THREE.Mesh(shoulderGeometry, materials.joints);
    rightShoulder.position.set(0.2, 1.3, 0);
    rightShoulder.name = 'rightShoulder';
    stickFigure.add(rightShoulder);
    
    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6);
    
    // Left upper arm
    const leftUpperArm = new THREE.Mesh(armGeometry, materials.arms);
    leftUpperArm.position.set(-0.35, 1.1, 0);
    leftUpperArm.name = 'leftUpperArm';
    stickFigure.add(leftUpperArm);
    
    // Right upper arm
    const rightUpperArm = new THREE.Mesh(armGeometry, materials.arms);
    rightUpperArm.position.set(0.35, 1.1, 0);
    rightUpperArm.name = 'rightUpperArm';
    stickFigure.add(rightUpperArm);
    
    // Elbows
    const leftElbow = new THREE.Mesh(shoulderGeometry, materials.joints);
    leftElbow.position.set(-0.35, 0.85, 0);
    leftElbow.name = 'leftElbow';
    stickFigure.add(leftElbow);
    
    const rightElbow = new THREE.Mesh(shoulderGeometry, materials.joints);
    rightElbow.position.set(0.35, 0.85, 0);
    rightElbow.name = 'rightElbow';
    stickFigure.add(rightElbow);
    
    // Forearms
    const leftForearm = new THREE.Mesh(armGeometry, materials.arms);
    leftForearm.position.set(-0.35, 0.6, 0);
    leftForearm.name = 'leftForearm';
    stickFigure.add(leftForearm);
    
    const rightForearm = new THREE.Mesh(armGeometry, materials.arms);
    rightForearm.position.set(0.35, 0.6, 0);
    rightForearm.name = 'rightForearm';
    stickFigure.add(rightForearm);
    
    // Hands
    const handGeometry = new THREE.SphereGeometry(0.03, 8, 8);
    const leftHand = new THREE.Mesh(handGeometry, materials.arms);
    leftHand.position.set(-0.35, 0.4, 0);
    leftHand.name = 'leftHand';
    stickFigure.add(leftHand);
    
    const rightHand = new THREE.Mesh(handGeometry, materials.arms);
    rightHand.position.set(0.35, 0.4, 0);
    rightHand.name = 'rightHand';
    stickFigure.add(rightHand);
    
    // Hips
    const hipGeometry = new THREE.SphereGeometry(0.04, 8, 8);
    const leftHip = new THREE.Mesh(hipGeometry, materials.joints);
    leftHip.position.set(-0.1, 0.6, 0);
    leftHip.name = 'leftHip';
    stickFigure.add(leftHip);
    
    const rightHip = new THREE.Mesh(hipGeometry, materials.joints);
    rightHip.position.set(0.1, 0.6, 0);
    rightHip.name = 'rightHip';
    stickFigure.add(rightHip);
    
    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6);
    
    // Thighs
    const leftThigh = new THREE.Mesh(legGeometry, materials.legs);
    leftThigh.position.set(-0.1, 0.3, 0);
    leftThigh.name = 'leftThigh';
    stickFigure.add(leftThigh);
    
    const rightThigh = new THREE.Mesh(legGeometry, materials.legs);
    rightThigh.position.set(0.1, 0.3, 0);
    rightThigh.name = 'rightThigh';
    stickFigure.add(rightThigh);
    
    // Knees
    const leftKnee = new THREE.Mesh(hipGeometry, materials.joints);
    leftKnee.position.set(-0.1, 0.1, 0);
    leftKnee.name = 'leftKnee';
    stickFigure.add(leftKnee);
    
    const rightKnee = new THREE.Mesh(hipGeometry, materials.joints);
    rightKnee.position.set(0.1, 0.1, 0);
    rightKnee.name = 'rightKnee';
    stickFigure.add(rightKnee);
    
    // Shins
    const leftShin = new THREE.Mesh(legGeometry, materials.legs);
    leftShin.position.set(-0.1, -0.1, 0);
    leftShin.name = 'leftShin';
    stickFigure.add(leftShin);
    
    const rightShin = new THREE.Mesh(legGeometry, materials.legs);
    rightShin.position.set(0.1, -0.1, 0);
    rightShin.name = 'rightShin';
    stickFigure.add(rightShin);
    
    // Feet
    const footGeometry = new THREE.BoxGeometry(0.06, 0.03, 0.15);
    const leftFoot = new THREE.Mesh(footGeometry, materials.legs);
    leftFoot.position.set(-0.1, -0.32, 0.04);
    leftFoot.name = 'leftFoot';
    stickFigure.add(leftFoot);
    
    const rightFoot = new THREE.Mesh(footGeometry, materials.legs);
    rightFoot.position.set(0.1, -0.32, 0.04);
    rightFoot.name = 'rightFoot';
    stickFigure.add(rightFoot);
    
    // Position the entire figure
    stickFigure.position.set(0, 0, 0);
    stickFigure.scale.setScalar(2); // Scale up for better visibility
    
    return stickFigure;
  }

  async function initializeThreeJS() {
    if (isThreeJSInitialized) return;
    
    try {
      console.log('Initializing Three.js with local mannequin models...');

      // Create a separate WebGL canvas
      if (!webglCanvas) {
        webglCanvas = document.createElement('canvas');
        webglCanvas.width = width;
        webglCanvas.height = height;
        webglCanvas.style.position = 'absolute';
        webglCanvas.style.top = '0';
        webglCanvas.style.left = '0';
        webglCanvas.style.width = '100%';
        webglCanvas.style.height = '100%';
        webglCanvas.style.transform = 'scaleX(-1)'; // Mirror like main canvas
        webglCanvas.className = 'webgl-canvas';
        
        // Insert into canvas container
        const container = canvasElement.parentElement;
        if (container) {
          container.appendChild(webglCanvas);
        }
      }

      // Create Three.js scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x222222); // Dark gray background

      // Create camera
      camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(0, 1, 3);
      camera.lookAt(0, 1, 0);

      // Create renderer using the dedicated WebGL canvas
      try {
        console.log('Creating WebGL renderer on dedicated canvas...');
        renderer = new THREE.WebGLRenderer({ 
          canvas: webglCanvas,
          antialias: true,
          preserveDrawingBuffer: false
        });
        console.log('WebGL renderer created successfully');
      } catch (webglError) {
        console.error('WebGL context creation failed:', webglError);
        throw new Error('Cannot create WebGL context. Your browser may not support WebGL.');
      }
      
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Add our lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 10, 5);
      directionalLight.castShadow = true;
      scene.add(directionalLight);

      // Only create mannequin if it doesn't already exist
      if (!mannequin) {
        // Try to import and create mannequin model (without createStage)
        try {
          // Import the local mannequin Male class and FABRIK
          const { Male } = await import('$lib/mannequin/bodies/Male.js');
          const { MannequinFABRIK } = await import('$lib/fabrik/MannequinFABRIK.js');
          
          // Set up the global scene that mannequin.js expects
          (globalThis as any).scene = scene;
          
          // Create the male mannequin
          mannequin = new Male(1.75);
          console.log('Local mannequin model loaded successfully');
          
          // Initialize FABRIK system
          try {
            mannequinFABRIK = new MannequinFABRIK(mannequin);
            console.log('FABRIK system initialized successfully');
          } catch (fabrikError) {
            console.warn('FABRIK initialization failed:', fabrikError);
            mannequinFABRIK = null;
          }
          
              // Mannequin is automatically added to the global scene
          
        } catch (mannequinError) {
          console.log('Local mannequin import failed, using stick figure:', mannequinError);
          // Create stick figure fallback
          mannequin = create3DStickFigure();
          scene.add(mannequin);
          console.log('Stick figure fallback created');
        }
      } else {
        console.log('Mannequin already exists, reusing...');
      }
      
      // 3D canvas is now ready
      
      isThreeJSInitialized = true;
      
    } catch (error) {
      console.error('Error initializing Three.js:', error);
      isThreeJSInitialized = false;
    }
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

    // Update mannequin pose with MediaPipe data
    if (poseData && mannequin) {
      updateMannequinPose(poseData);
    }

    // Render the scene
    renderer.render(scene, camera);
  }

  function updateMannequinPose(data: any) {
    if (!mannequin || !data.poseLandmarks) return;

    const landmarks = data.poseLandmarks;

    // MediaPipe pose landmark indices
    const POSE_LANDMARKS = {
      LEFT_SHOULDER: 11,
      RIGHT_SHOULDER: 12,
      LEFT_ELBOW: 13,
      RIGHT_ELBOW: 14,
      LEFT_WRIST: 15,
      RIGHT_WRIST: 16,
      LEFT_HIP: 23,
      RIGHT_HIP: 24,
      LEFT_KNEE: 25,
      RIGHT_KNEE: 26,
      LEFT_ANKLE: 27,
      RIGHT_ANKLE: 28,
      NOSE: 0
    };

    // Check if this is a real mannequin.js figure or our fallback stick figure
    const isRealMannequin = mannequin.head && typeof mannequin.head.turn !== 'undefined';

    if (isRealMannequin) {
      // Choose between FABRIK IK and traditional pose mapping
      if (useFABRIK && mannequinFABRIK) {
        // Use FABRIK inverse kinematics
        mannequinFABRIK.solveFromPoseData(data);
      } else {
        // Use traditional mannequin.js articulated body part rotations
        updateMannequinJSPose(landmarks, POSE_LANDMARKS);
      }
    } else {
      // Use our stick figure position updates
      updateStickFigurePose(landmarks, POSE_LANDMARKS);
    }
  }

  function updateMannequinJSPose(landmarks: any, POSE_LANDMARKS: any) {
    // Helper functions to calculate angles
    function calculateAngle3D(p1: any, p2: any, p3: any) {
      const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
      
      const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
      const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
      const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
      
      const angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
      return (angle * 180) / Math.PI;
    }

    // Helper function to check if landmark is visible and within reasonable bounds
    function isValidLandmark(landmark: any) {
      return landmark && 
             landmark.visibility > 0.5 && 
             landmark.x >= -0.2 && landmark.x <= 1.2 &&  // Allow some off-screen but not too extreme
             landmark.y >= -0.2 && landmark.y <= 1.2;
    }

    try {
      // Update head rotation (only if nose and shoulders are visible)
      if (isValidLandmark(landmarks[POSE_LANDMARKS.NOSE]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_SHOULDER]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_SHOULDER])) {
        
        const nose = landmarks[POSE_LANDMARKS.NOSE];
        const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
        const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
        
        const shoulderCenter = {
          x: (leftShoulder.x + rightShoulder.x) / 2,
          y: (leftShoulder.y + rightShoulder.y) / 2,
          z: (leftShoulder.z + rightShoulder.z) / 2
        };
        
        const headTurn = (nose.x - shoulderCenter.x) * 80; // Reduced sensitivity
        mannequin.head.turn = Math.max(-30, Math.min(30, headTurn));
        
        const headNod = (shoulderCenter.y - nose.y) * 20; // Reduced sensitivity
        mannequin.head.nod = Math.max(-20, Math.min(20, headNod));
      }

      // Update arm rotations (with validation)
      if (isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_SHOULDER]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_ELBOW]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_WRIST])) {
        
        const shoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
        const elbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
        const wrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
        
        const armRaise = (shoulder.y - elbow.y) * 120; // Slightly increased sensitivity for arms
        // mannequin.l_arm.raise = Math.max(-90, Math.min(180, armRaise));
        mannequin.r_arm.raise = Math.max(-90, Math.min(180, armRaise));
        
        const armStraddle = (elbow.x - shoulder.x) * 100;
        // mannequin.l_arm.straddle = Math.max(-90, Math.min(90, armStraddle));
        mannequin.r_arm.straddle = Math.max(-90, Math.min(90, armStraddle));
        
        const elbowBend = 180 - calculateAngle3D(shoulder, elbow, wrist);
        // mannequin.l_elbow.bend = Math.max(0, Math.min(160, elbowBend));
        mannequin.r_elbow.bend = Math.max(0, Math.min(160, elbowBend));
      }

      if (isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_ELBOW]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_WRIST])) {
        
        const shoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
        const elbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
        const wrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
        
        const armRaise = (shoulder.y - elbow.y) * 120;
        // mannequin.r_arm.raise = Math.max(-90, Math.min(180, armRaise));
        mannequin.l_arm.raise = Math.max(-90, Math.min(180, armRaise));
        
        const armStraddle = (shoulder.x - elbow.x) * 100;
        // mannequin.r_arm.straddle = Math.max(-90, Math.min(90, armStraddle));
        mannequin.l_arm.straddle = Math.max(-90, Math.min(90, armStraddle));
        
        const elbowBend = 180 - calculateAngle3D(shoulder, elbow, wrist);
        // mannequin.r_elbow.bend = Math.max(0, Math.min(160, elbowBend));
        mannequin.l_elbow.bend = Math.max(0, Math.min(160, elbowBend));
      }

      // Update leg rotations (with validation and reduced sensitivity)
      if (isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_HIP]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_KNEE]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_ANKLE])) {
        
        const hip = landmarks[POSE_LANDMARKS.LEFT_HIP];
        const knee = landmarks[POSE_LANDMARKS.LEFT_KNEE];
        const ankle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
        
        const legRaise = (hip.y - knee.y) * 30; // sensitivity
        mannequin.l_leg.raise = Math.max(-30, Math.min(60, legRaise)); // Reduced range
        
        const kneeBend = calculateAngle3D(hip, knee, ankle);
        mannequin.l_knee.bend = Math.max(0, Math.min(160, 180 - kneeBend));
      }

      if (isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_HIP]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_KNEE]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_ANKLE])) {
        
        const hip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
        const knee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
        const ankle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
        
        const legRaise = (hip.y - knee.y) * 30; // sensitivity
        mannequin.r_leg.raise = Math.max(-30, Math.min(60, legRaise)); // Reduced range
        
        const kneeBend = calculateAngle3D(hip, knee, ankle);
        mannequin.r_knee.bend = Math.max(0, Math.min(160, 180 - kneeBend));
      }

      // Update torso rotation (with validation)
      if (isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_SHOULDER]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_HIP]) && 
          isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_HIP])) {
        
        const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
        const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
        const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
        const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
        
        const shoulderCenter = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
        const hipCenter = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
        
        const torsoBend = (shoulderCenter.y - hipCenter.y - 0.15) * 60; // Reduced sensitivity
        mannequin.torso.bend = Math.max(-30, Math.min(30, torsoBend)); // Reduced range
      }

    } catch (error) {
      console.warn('Error updating mannequin.js pose:', error);
    }
  }

  function updateStickFigurePose(landmarks: any, POSE_LANDMARKS: any) {
    // Helper function to map MediaPipe coordinates to 3D world coordinates
    function mapToWorld(landmark: any) {
      return {
        x: (landmark.x - 0.5) * 4,
        y: (0.5 - landmark.y) * 3,
        z: -landmark.z * 2
      };
    }

    try {
      // Update head position (with better positioning)
      if (landmarks[POSE_LANDMARKS.NOSE]) {
        const head = mannequin.getObjectByName('head');
        if (head) {
          const nosePos = mapToWorld(landmarks[POSE_LANDMARKS.NOSE]);
          head.position.set(nosePos.x, nosePos.y + 0.1, nosePos.z); // Reduced offset
        }
      }

      // Update other body parts with proper scaling
      const bodyParts = [
        { landmark: POSE_LANDMARKS.LEFT_SHOULDER, name: 'leftShoulder', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.RIGHT_SHOULDER, name: 'rightShoulder', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.LEFT_ELBOW, name: 'leftElbow', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.RIGHT_ELBOW, name: 'rightElbow', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.LEFT_WRIST, name: 'leftHand', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.RIGHT_WRIST, name: 'rightHand', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.LEFT_HIP, name: 'leftHip', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.RIGHT_HIP, name: 'rightHip', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.LEFT_KNEE, name: 'leftKnee', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.RIGHT_KNEE, name: 'rightKnee', offset: { x: 0, y: 0, z: 0 } },
        { landmark: POSE_LANDMARKS.LEFT_ANKLE, name: 'leftFoot', offset: { x: 0, y: -0.1, z: 0 } },
        { landmark: POSE_LANDMARKS.RIGHT_ANKLE, name: 'rightFoot', offset: { x: 0, y: -0.1, z: 0 } }
      ];

      bodyParts.forEach(part => {
        if (landmarks[part.landmark]) {
          const bodyPart = mannequin.getObjectByName(part.name);
          if (bodyPart) {
            const pos = mapToWorld(landmarks[part.landmark]);
            bodyPart.position.set(
              pos.x + part.offset.x, 
              pos.y + part.offset.y, 
              pos.z + part.offset.z
            );
          }
        }
      });

    } catch (error) {
      console.warn('Error updating stick figure pose:', error);
    }
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
      const handText = activeHand === 'left' ? 'Left Hand' : 'Right Hand';
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
    const totalDelay = 10000; // 10 seconds
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
  

  // Reactive statement to handle visualization mode changes
  $: if (canvasElement && visualizationMode) {
    switchVisualizationMode();
  }

  function switchVisualizationMode() {
    if (visualizationMode === 'advanced') {
      // Show 3D canvas, hide 2D canvas
      if (canvasElement) {
        canvasElement.style.display = 'none';
      }
      if (!isThreeJSInitialized) {
        initializeThreeJS();
      } else if (webglCanvas) {
        webglCanvas.style.display = 'block';
      }
    } else if (visualizationMode === 'basic') {
      // Show 2D canvas, hide 3D canvas
      if (webglCanvas) {
        webglCanvas.style.display = 'none';
      }
      if (canvasElement) {
        canvasElement.style.display = 'block';
      }
      initialize2DCanvas();
    }
  }

  function initialize2DCanvas() {
    try {
      // Ensure 2D canvas context
      if (canvasElement && !ctx) {
        ctx = canvasElement.getContext('2d');
      }
      
      // Clear the 2D canvas
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
      }
      
      isThreeJSInitialized = false;
    } catch (error) {
      console.error('Error switching to 2D mode:', error);
    }
  }

  // Handle window resize
  function handleResize() {
    if (canvasElement) {
      canvasElement.width = width;
      canvasElement.height = height;
    }
    
    if (webglCanvas) {
      webglCanvas.width = width;
      webglCanvas.height = height;
    }
      
    // Update Three.js renderer if initialized
    if (renderer && camera) {
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  // Reactive statement to handle prop changes
  $: if (canvasElement) {
    handleResize();
  }

  function toggleVisualizationMode() {
    visualizationMode = visualizationMode === 'basic' ? 'advanced' : 'basic';
  }

  function toggleFABRIK() {
    useFABRIK = !useFABRIK;
    console.log('FABRIK IK:', useFABRIK ? 'enabled' : 'disabled');
  }
</script>

<div class="canvas-container">
  <canvas 
    bind:this={canvasElement} 
    {width} 
    {height}
    class="fullscreen-canvas"
    on:click={handleCanvasClick}
  ></canvas>
  
  <button 
    class="mode-toggle-btn"
    on:click={toggleVisualizationMode}
    title="Switch between 2D and 3D visualization"
  >
    {visualizationMode === 'basic' ? '3D' : '2D'}
  </button>
  
  {#if visualizationMode === 'advanced' && mannequinFABRIK}
    <button 
      class="fabrik-toggle-btn"
      on:click={toggleFABRIK}
      title="Toggle FABRIK inverse kinematics"
    >
      {useFABRIK ? 'IK ON' : 'IK OFF'}
    </button>
  {/if}
</div>

<style>
  .canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .fullscreen-canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: #000;
    transform: scaleX(-1); /* Mirror the canvas horizontally to match webcam */
  }
  
  :global(.webgl-canvas) {
    display: block;
    width: 100%;
    height: 100%;
    background: #222;
  }

  .mode-toggle-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: 2px solid #4CAF50;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    z-index: 10;
  }

  .mode-toggle-btn:hover {
    background: rgba(76, 175, 80, 0.2);
    border-color: #66BB6A;
    transform: scale(1.05);
  }

  .mode-toggle-btn:active {
    transform: scale(0.95);
  }

  .fabrik-toggle-btn {
    position: absolute;
    top: 80px;
    right: 20px;
    padding: 12px 20px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: 2px solid #FF9800;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    z-index: 10;
  }

  .fabrik-toggle-btn:hover {
    background: rgba(255, 152, 0, 0.2);
    border-color: #FFB74D;
    transform: scale(1.05);
  }

  .fabrik-toggle-btn:active {
    transform: scale(0.95);
  }
</style>