<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { GameService, GAME_MODES, TARGET_TYPES, type GameMode } from '../services/gameService';
	import { gameColors, poseColors, hipSwaySettings } from '../stores/themeStore';
	import { gameSettings } from '../stores/gameStore';
	import { audioService } from '../services/audioService';
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver.js';

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
	let ikSolver: CCDIKSolver | null = null;
	let ikTargets: { [key: string]: THREE.Object3D } = {};

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
			// Always start with 2D context first to ensure canvas is ready
			initializeCanvas();
			gameService = new GameService(width, height, gameMode as GameMode);
			
			// If advanced mode is requested, switch after a delay
			if (visualizationMode === 'advanced') {
				setTimeout(() => {
					switchVisualizationMode();
				}, 200);
			} else {
				animate();
			}
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
			console.log('Switching to basic 2D mode...');

			// Clean up Three.js resources properly
			if (renderer) {
				renderer.dispose();
				renderer = null;
			}
			if (scene) {
				// Clean up scene objects
				while (scene.children.length > 0) {
					scene.remove(scene.children[0]);
				}
			}

			// Reset Three.js variables
			isThreeJSInitialized = false;
			characterModel = null;
			bones = {};
			ikSolver = null;
			ikTargets = {};

			// Force clear the canvas context and initialize 2D
			// This ensures we get a fresh 2D context
			canvasElement.width = canvasElement.width; // Clears canvas and resets context
			initializeCanvas();
		} else {
			// Switch to 3D Three.js
			console.log('Switching to advanced 3D mode...');

			// Clear 2D context completely
			ctx = null;

			// Force clear the canvas to release all contexts
			canvasElement.width = canvasElement.width; // This clears canvas and releases contexts

			// Longer delay to ensure context is fully released
			setTimeout(() => {
				initializeThreeJS();
			}, 100);
			return; // Exit early to prevent immediate animate() call
		}

		// Restart animation loop
		animate();
	}

	function initializeCanvas() {
		// Try to get 2D context
		ctx = canvasElement.getContext('2d');
		if (!ctx) {
			console.warn('Could not get 2D context, canvas may be in use by WebGL');
			// Force clear the canvas and try again
			canvasElement.width = canvasElement.width; // Clears canvas
			ctx = canvasElement.getContext('2d');

			if (!ctx) {
				console.error('Failed to get 2D context after clearing canvas');
				return;
			}
		}

		isThreeJSInitialized = false;
		console.log('2D Canvas context initialized successfully:', !!ctx);
	}

	async function initializeThreeJS() {
		try {
			console.log('Initializing Three.js...');

			// Create scene
			scene = new THREE.Scene();
			scene.background = new THREE.Color(0x1a1a1a);

			// Create camera with better positioning for scaled model
			camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
			camera.position.set(0, 2, 8); // Move camera further back for larger model
			camera.lookAt(0, 0, 0); // Look at center of scaled model

			// Create renderer with better WebGL context options
			try {
				renderer = new THREE.WebGLRenderer({
					canvas: canvasElement,
					antialias: false, // Disable for better compatibility
					alpha: false,
					powerPreference: 'default',
					failIfMajorPerformanceCaveat: false,
					preserveDrawingBuffer: false,
					stencil: false,
					depth: true
				});
				renderer.setSize(width, height);
				renderer.shadowMap.enabled = false; // Disable shadows for better compatibility
				console.log('Three.js renderer created successfully');
			} catch (rendererError) {
				console.error('Failed to create WebGL renderer with advanced options:', rendererError);

				// Try creating with minimal options as fallback
				try {
					renderer = new THREE.WebGLRenderer({
						canvas: canvasElement,
						failIfMajorPerformanceCaveat: false
					});
					renderer.setSize(width, height);
					console.log('Three.js renderer created with minimal options');
				} catch (fallbackError) {
					console.error(
						'Failed to create WebGL renderer even with minimal options:',
						fallbackError
					);
					throw fallbackError;
				}
			}

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

			// Load GLTF model
			gltfLoader = new GLTFLoader();
			try {
				const gltf = await gltfLoader.loadAsync('/src/assets/phil.gltf');
        
				characterModel = gltf.scene;
				characterModel.scale.set(6, 6, 6); // Scale up to be more lifesize
				characterModel.position.set(0, -5, 0); // Lower position to fit in frame

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
							shirt: 0x4caf50, // Green
							pants: 0x2196f3, // Blue
							shoes: 0x424242, // Dark gray
							skin: 0xffdbb3, // Skin tone
							hair: 0x8d6e63, // Brown
							face: 0xffdbb3, // Skin tone
							head: 0xffdbb3, // Skin tone
							body: 0xffdbb3, // Skin tone
							default: 0x888888 // Gray fallback
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
							opacity: 1.0,
							vertexColors: false // Disable vertex colors to fix rendering issues
						});

						console.log(
							`Replaced material for ${mesh.name || 'unnamed'} with color:`,
							color.toString(16)
						);
					}
				});

				console.log('Material replacement completed');

				scene.add(characterModel);

				// Also collect bones from SkinnedMesh skeleton for IK
				characterModel.traverse((child) => {
					if (child instanceof THREE.SkinnedMesh && child.skeleton) {
						console.log('Found SkinnedMesh with skeleton, adding skeleton bones to collection');
						child.skeleton.bones.forEach((bone: THREE.Bone) => {
							if (bone.name && !bones[bone.name]) {
								bones[bone.name] = bone;
							}
						});
					}
				});

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

				// Setup IK solver for better bone movement
				setupIKSolver();

				// Debug: Log some key bone names we're looking for
				const keyBones = [
					'Head',
					'Neck',
					'Spine',
					'Hips',
					'LeftArm',
					'RightArm',
					'ArmL',
					'ArmR',
					'ThighL',
					'ThighR',
					'KneeL',
					'KneeR',
					'FootL',
					'FootR',
					// Additional possible arm bone names
					'LeftShoulder',
					'RightShoulder',
					'ShoulderL',
					'ShoulderR',
					'LeftForeArm',
					'RightForeArm',
					'ForeArmL',
					'ForeArmR',
					'LeftHand',
					'RightHand',
					'HandL',
					'HandR'
				];
				keyBones.forEach((boneName) => {
					if (bones[boneName]) {
						console.log(`Found key bone: ${boneName}`);
					}
				});

				// Debug: List all bone names that contain "arm", "hand", "shoulder", or "elbow"
				const armBones = Object.keys(bones).filter(
					(name) =>
						name.toLowerCase().includes('arm') ||
						name.toLowerCase().includes('hand') ||
						name.toLowerCase().includes('shoulder') ||
						name.toLowerCase().includes('elbow') ||
						name.toLowerCase().includes('wrist')
				);
				console.log('Arm-related bones found:', armBones);
			} catch (error) {
				console.error('Error loading character model:', error);
				// Fallback to basic 3D pose visualization
				createBasic3DPose();
			}

			isThreeJSInitialized = true;

			// Start animation loop for Three.js mode
			animate();
		} catch (error) {
			console.error('Error initializing Three.js:', error);
			console.warn('Falling back to basic 2D visualization mode');
			// Fall back to 2D canvas mode
			visualizationMode = 'basic';
			isThreeJSInitialized = false;
			initializeCanvas();

			// Show user notification about the fallback
			console.warn(
				'Advanced 3D mode is not supported on this device. Using basic 2D visualization instead.'
			);

			// Start animation loop for fallback mode
			animate();
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
			[11, 12],
			[11, 13],
			[13, 15],
			[12, 14],
			[14, 16],
			[11, 23],
			[12, 24],
			[23, 24],
			[23, 25],
			[25, 27],
			[27, 29],
			[29, 31],
			[24, 26],
			[26, 28],
			[28, 30],
			[30, 32]
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
			[11, 12],
			[11, 13],
			[13, 15],
			[12, 14],
			[14, 16],
			[11, 23],
			[12, 24],
			[23, 24],
			[23, 25],
			[25, 27],
			[27, 29],
			[29, 31],
			[24, 26],
			[26, 28],
			[28, 30],
			[30, 32]
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
					positions.setXYZ(
						0,
						(startLandmark.x - 0.5) * 4,
						(0.5 - startLandmark.y) * 3,
						-startLandmark.z * 2
					);
					positions.setXYZ(
						1,
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

	function setupIKSolver() {
		if (!characterModel || Object.keys(bones).length === 0) {
			console.warn('Cannot setup IK solver: missing character model or bones');
			return;
		}

		console.log('Setting up IK solver...');

		// Helper function to find bone by possible names
		function findBone(possibleNames: string[]): THREE.Bone | null {
			for (const name of possibleNames) {
				if (bones[name]) return bones[name];
			}
			return null;
		}

		// Create IK targets for key body parts
		const targetGeometry = new THREE.SphereGeometry(0.05);
		const targetMaterial = new THREE.MeshBasicMaterial({
			color: 0xff0000,
			transparent: true,
			opacity: 0.3
		});

		// Create IK targets for hands
		const leftHandTarget = new THREE.Mesh(targetGeometry, targetMaterial.clone());
		const rightHandTarget = new THREE.Mesh(targetGeometry, targetMaterial.clone());

		// Create IK targets for feet
		const leftFootTarget = new THREE.Mesh(targetGeometry, targetMaterial.clone());
		const rightFootTarget = new THREE.Mesh(targetGeometry, targetMaterial.clone());

		// Add targets to scene (make them invisible for now)
		leftHandTarget.visible = false;
		rightHandTarget.visible = false;
		leftFootTarget.visible = false;
		rightFootTarget.visible = false;

		scene.add(leftHandTarget);
		scene.add(rightHandTarget);
		scene.add(leftFootTarget);
		scene.add(rightFootTarget);

		// Store targets for later use
		ikTargets = {
			leftHand: leftHandTarget,
			rightHand: rightHandTarget,
			leftFoot: leftFootTarget,
			rightFoot: rightFootTarget
		};

		// Setup IK chains and targets array
		const ikChains = [];
		const ikTargetArray = [leftHandTarget, rightHandTarget, leftFootTarget, rightFootTarget];
		console.log('Created IK targets:', ikTargetArray.length);

		// Left arm IK chain (using actual bone names from console output)
		const leftShoulder = findBone(['ShoulderL', 'LeftShoulder', 'shoulder_L', 'LeftArm', 'ArmL']);
		const leftElbow = findBone([
			'UpperArmL',
			'LeftElbow',
			'ElbowL',
			'elbow_L',
			'LeftForeArm',
			'ForeArmL'
		]);
		const leftWrist = findBone(['WristL', 'LeftWrist', 'wrist_L', 'LeftHand', 'HandL']);

		if (leftShoulder && leftElbow && leftWrist) {
			ikChains.push({
				target: 0, // Index of leftHandTarget in ikTargetArray
				effector: leftWrist,
				links: [{ index: leftShoulder }, { index: leftElbow }]
			});
			console.log('Created left arm IK chain:', {
				leftShoulder: leftShoulder.name,
				leftElbow: leftElbow.name,
				leftWrist: leftWrist.name
			});
		} else {
			console.warn('Left arm bones not found:', { leftShoulder, leftElbow, leftWrist });
		}

		// Right arm IK chain (using actual bone names from console output)
		const rightShoulder = findBone([
			'ShoulderR',
			'RightShoulder',
			'shoulder_R',
			'RightArm',
			'ArmR'
		]);
		const rightElbow = findBone([
			'UpperArmR',
			'RightElbow',
			'ElbowR',
			'elbow_R',
			'RightForeArm',
			'ForeArmR'
		]);
		const rightWrist = findBone(['WristR', 'RightWrist', 'wrist_R', 'RightHand', 'HandR']);

		if (rightShoulder && rightElbow && rightWrist) {
			ikChains.push({
				target: 1, // Index of rightHandTarget
				effector: rightWrist,
				links: [{ index: rightShoulder }, { index: rightElbow }]
			});
			console.log('Created right arm IK chain:', {
				rightShoulder: rightShoulder.name,
				rightElbow: rightElbow.name,
				rightWrist: rightWrist.name
			});
		} else {
			console.warn('Right arm bones not found:', { rightShoulder, rightElbow, rightWrist });
		}

		// Left leg IK chain
		const leftThigh = findBone(['LeftUpLeg', 'ThighL', 'thigh_L', 'LeftThigh']);
		const leftKnee = findBone(['LeftLeg', 'KneeL', 'knee_L', 'LeftKnee']);
		const leftFoot = findBone(['LeftFoot', 'FootL', 'foot_L', 'LeftAnkle']);

		if (leftThigh && leftKnee && leftFoot) {
			ikChains.push({
				target: 2, // Index of leftFootTarget
				effector: leftFoot,
				links: [{ index: leftThigh }, { index: leftKnee }]
			});
			console.log('Created left leg IK chain');
		}

		// Right leg IK chain
		const rightThigh = findBone(['RightUpLeg', 'ThighR', 'thigh_R', 'RightThigh']);
		const rightKnee = findBone(['RightLeg', 'KneeR', 'knee_R', 'RightKnee']);
		const rightFoot = findBone(['RightFoot', 'FootR', 'foot_R', 'RightAnkle']);

		if (rightThigh && rightKnee && rightFoot) {
			ikChains.push({
				target: 3, // Index of rightFootTarget
				effector: rightFoot,
				links: [{ index: rightThigh }, { index: rightKnee }]
			});
			console.log('Created right leg IK chain');
		}

		// Create IK solver if we have chains
		if (ikChains.length > 0) {
			try {
				// Find the SkinnedMesh within the character model
				let skinnedMesh: THREE.SkinnedMesh | null = null;
				characterModel.traverse((child) => {
					if (child instanceof THREE.SkinnedMesh) {
						skinnedMesh = child as THREE.SkinnedMesh;
					}
				});

				if (skinnedMesh) {
					const skeleton = (skinnedMesh as THREE.SkinnedMesh).skeleton;
					console.log('SkinnedMesh skeleton bones:', skeleton.bones.map((bone: THREE.Bone) => bone.name));
					console.log('Total skeleton bones:', skeleton.bones.length);
					
					// Create IK configuration with proper structure for CCDIKSolver
					const ikConfig: any[] = [];

					// Helper function to find bone index by name in skeleton
					function findBoneIndexByName(boneName: string): number {
						return skeleton.bones.findIndex((bone: THREE.Bone) => bone.name === boneName);
					}

					// Only add chains that have valid bones
					ikChains.forEach((chain) => {
						if (chain.effector && chain.links.every((link) => link.index)) {
							const effectorIndex = findBoneIndexByName(chain.effector.name);
							const linkIndices = chain.links.map((link) => findBoneIndexByName(link.index.name));

							console.log('Checking IK chain:', {
								effectorName: chain.effector.name,
								effectorIndex,
								linkNames: chain.links.map(link => link.index.name),
								linkIndices
							});

							// Only add if all bone indices are valid
							if (effectorIndex >= 0 && linkIndices.every((idx) => idx >= 0)) {
								ikConfig.push({
									target: chain.target, // Index in target array
									effector: effectorIndex,
									links: linkIndices.map((index) => ({ index }))
								});
							} else {
								console.warn('Invalid bone indices for IK chain:', { 
									effectorName: chain.effector.name,
									effectorIndex, 
									linkNames: chain.links.map(link => link.index.name),
									linkIndices 
								});
							}
						}
					});

					if (ikConfig.length > 0) {
						ikSolver = new CCDIKSolver(skinnedMesh, ikConfig);
						console.log(`IK solver created with ${ikConfig.length} valid chains`);
					} else {
						console.warn('No valid IK chains created');
						ikSolver = null;
					}
				} else {
					console.warn('No SkinnedMesh found in character model for IK solver');
					ikSolver = null;
				}
			} catch (error) {
				console.error('Failed to create IK solver:', error);
				ikSolver = null;
			}
		} else {
			console.warn('No valid IK chains found');
		}
	}

	function updateCharacterBones(data: any) {
		if (!data.poseLandmarks || Object.keys(bones).length === 0) return;

		const landmarks = data.poseLandmarks;

		// If we have an IK solver, use it for better movement
		if (ikSolver && ikTargets) {
			updateWithIK(landmarks);
		} else {
			// Fallback to direct bone manipulation
			updateWithDirectBoneControl(landmarks);
		}
	}

	function updateWithIK(landmarks: any[]) {
		// MediaPipe landmark indices
		const POSE_LANDMARKS = {
			LEFT_WRIST: 15,
			RIGHT_WRIST: 16,
			LEFT_ANKLE: 27,
			RIGHT_ANKLE: 28
		};

		// Helper function to convert MediaPipe coordinates to 3D world space
		function mediaPipeToWorld(landmark: any, scale = 1) {
			return new THREE.Vector3(
				(landmark.x - 0.5) * 6 * scale, // Scale for world size
				(0.5 - landmark.y) * 4 * scale, // Flip Y and scale
				-landmark.z * 3 * scale // Scale Z depth
			);
		}

		try {
			// Update IK target positions based on MediaPipe landmarks
			const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
			const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
			const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
			const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

			// Update hand targets
			if (leftWrist && leftWrist.visibility > 0.5 && ikTargets.leftHand) {
				const leftHandPos = mediaPipeToWorld(leftWrist);
				ikTargets.leftHand.position.copy(leftHandPos);
			}

			if (rightWrist && rightWrist.visibility > 0.5 && ikTargets.rightHand) {
				const rightHandPos = mediaPipeToWorld(rightWrist);
				ikTargets.rightHand.position.copy(rightHandPos);
			}

			// Update foot targets
			if (leftAnkle && leftAnkle.visibility > 0.5 && ikTargets.leftFoot) {
				const leftFootPos = mediaPipeToWorld(leftAnkle);
				ikTargets.leftFoot.position.copy(leftFootPos);
			}

			if (rightAnkle && rightAnkle.visibility > 0.5 && ikTargets.rightFoot) {
				const rightFootPos = mediaPipeToWorld(rightAnkle);
				ikTargets.rightFoot.position.copy(rightFootPos);
			}

			// Update IK solver
			if (ikSolver) {
				ikSolver.update();
			}
		} catch (error) {
			console.warn('Error updating IK:', error);
		}
	}

	function updateWithDirectBoneControl(landmarks: any[]) {
		// Helper function to find bone by possible names
		function findBone(possibleNames: string[]): THREE.Bone | null {
			for (const name of possibleNames) {
				if (bones[name]) return bones[name];
			}
			return null;
		}

		// MediaPipe landmark indices
		const POSE_LANDMARKS = {
			NOSE: 0,
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
			RIGHT_ANKLE: 28
		};

		// Helper function to convert MediaPipe coordinates to 3D world space
		function mediaPipeToWorld(landmark: any, scale = 1) {
			return new THREE.Vector3(
				(landmark.x - 0.5) * 6 * scale, // Scale for world size
				(0.5 - landmark.y) * 4 * scale, // Flip Y and scale
				-landmark.z * 3 * scale // Scale Z depth
			);
		}

		// Helper function to calculate rotation from two points
		function getRotationFromDirection(from: THREE.Vector3, to: THREE.Vector3) {
			const direction = new THREE.Vector3().subVectors(to, from).normalize();
			const quaternion = new THREE.Quaternion();
			quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
			return quaternion;
		}

		try {
			// HEAD/NECK CONTROL
			const nosePos = landmarks[POSE_LANDMARKS.NOSE];
			const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
			const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];

			if (
				nosePos &&
				leftShoulder &&
				rightShoulder &&
				nosePos.visibility > 0.5 &&
				leftShoulder.visibility > 0.5 &&
				rightShoulder.visibility > 0.5
			) {
				// Calculate neck/head position and rotation
				const shoulderCenter = {
					x: (leftShoulder.x + rightShoulder.x) / 2,
					y: (leftShoulder.y + rightShoulder.y) / 2,
					z: (leftShoulder.z + rightShoulder.z) / 2
				};

				const neckWorldPos = mediaPipeToWorld(shoulderCenter);
				const headWorldPos = mediaPipeToWorld(nosePos);

				// Control head/neck bones
				const headBone = findBone(['Head', 'head', 'HEAD']);
				const neckBone = findBone(['Neck', 'neck', 'NECK']);

				if (headBone) {
					headBone.position.copy(headWorldPos);
					// Calculate head rotation based on direction from neck to nose
					const headRotation = getRotationFromDirection(neckWorldPos, headWorldPos);
					headBone.quaternion.copy(headRotation);
				}

				if (neckBone) {
					neckBone.position.copy(neckWorldPos);
				}
			}

			// ARM CONTROL
			const leftShoulderPos = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
			const leftElbowPos = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
			const leftWristPos = landmarks[POSE_LANDMARKS.LEFT_WRIST];

			if (
				leftShoulderPos &&
				leftElbowPos &&
				leftWristPos &&
				leftShoulderPos.visibility > 0.5 &&
				leftElbowPos.visibility > 0.5 &&
				leftWristPos.visibility > 0.5
			) {
				// Left arm bone mapping
				const leftShoulderWorld = mediaPipeToWorld(leftShoulderPos);
				const leftElbowWorld = mediaPipeToWorld(leftElbowPos);
				const leftWristWorld = mediaPipeToWorld(leftWristPos);

				// Control left arm bones with flexible naming
				const leftShoulderBone = findBone([
					'LeftShoulder',
					'ShoulderL',
					'shoulder_L',
					'LeftArm',
					'ArmL'
				]);
				const leftElbowBone = findBone([
					'LeftElbow',
					'ElbowL',
					'elbow_L',
					'LeftForeArm',
					'ForeArmL'
				]);
				const leftWristBone = findBone(['LeftWrist', 'WristL', 'wrist_L', 'LeftHand', 'HandL']);

				if (leftShoulderBone) {
					leftShoulderBone.position.copy(leftShoulderWorld);
					const upperArmRotation = getRotationFromDirection(leftShoulderWorld, leftElbowWorld);
					leftShoulderBone.quaternion.copy(upperArmRotation);
				}

				if (leftElbowBone) {
					leftElbowBone.position.copy(leftElbowWorld);
					const forearmRotation = getRotationFromDirection(leftElbowWorld, leftWristWorld);
					leftElbowBone.quaternion.copy(forearmRotation);
				}

				if (leftWristBone) {
					leftWristBone.position.copy(leftWristWorld);
				}
			}

			// Right arm (similar to left arm)
			const rightShoulderPos = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
			const rightElbowPos = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
			const rightWristPos = landmarks[POSE_LANDMARKS.RIGHT_WRIST];

			if (
				rightShoulderPos &&
				rightElbowPos &&
				rightWristPos &&
				rightShoulderPos.visibility > 0.5 &&
				rightElbowPos.visibility > 0.5 &&
				rightWristPos.visibility > 0.5
			) {
				const rightShoulderWorld = mediaPipeToWorld(rightShoulderPos);
				const rightElbowWorld = mediaPipeToWorld(rightElbowPos);
				const rightWristWorld = mediaPipeToWorld(rightWristPos);

				// Control right arm bones with flexible naming
				const rightShoulderBone = findBone([
					'RightShoulder',
					'ShoulderR',
					'shoulder_R',
					'RightArm',
					'ArmR'
				]);
				const rightElbowBone = findBone([
					'RightElbow',
					'ElbowR',
					'elbow_R',
					'RightForeArm',
					'ForeArmR'
				]);
				const rightWristBone = findBone(['RightWrist', 'WristR', 'wrist_R', 'RightHand', 'HandR']);

				if (rightShoulderBone) {
					rightShoulderBone.position.copy(rightShoulderWorld);
					const upperArmRotation = getRotationFromDirection(rightShoulderWorld, rightElbowWorld);
					rightShoulderBone.quaternion.copy(upperArmRotation);
				}

				if (rightElbowBone) {
					rightElbowBone.position.copy(rightElbowWorld);
					const forearmRotation = getRotationFromDirection(rightElbowWorld, rightWristWorld);
					rightElbowBone.quaternion.copy(forearmRotation);
				}

				if (rightWristBone) {
					rightWristBone.position.copy(rightWristWorld);
				}
			}

			// HIP CONTROL
			const leftHipPos = landmarks[POSE_LANDMARKS.LEFT_HIP];
			const rightHipPos = landmarks[POSE_LANDMARKS.RIGHT_HIP];

			if (
				leftHipPos &&
				rightHipPos &&
				leftHipPos.visibility > 0.5 &&
				rightHipPos.visibility > 0.5
			) {
				const hipCenter = {
					x: (leftHipPos.x + rightHipPos.x) / 2,
					y: (leftHipPos.y + rightHipPos.y) / 2,
					z: (leftHipPos.z + rightHipPos.z) / 2
				};

				const hipWorldPos = mediaPipeToWorld(hipCenter);

				// Control hip/spine bones
				const hipBone = findBone(['Hips', 'hips', 'Hip', 'hip']);
				const spineBone = findBone(['Spine', 'spine', 'SPINE']);

				if (hipBone) {
					hipBone.position.copy(hipWorldPos);
				}

				if (spineBone) {
					spineBone.position.copy(hipWorldPos);
				}
			}

			// LEG CONTROL
			const leftKneePos = landmarks[POSE_LANDMARKS.LEFT_KNEE];
			const leftAnklePos = landmarks[POSE_LANDMARKS.LEFT_ANKLE];

			if (
				leftHipPos &&
				leftKneePos &&
				leftAnklePos &&
				leftHipPos.visibility > 0.5 &&
				leftKneePos.visibility > 0.5 &&
				leftAnklePos.visibility > 0.5
			) {
				const leftHipWorld = mediaPipeToWorld(leftHipPos);
				const leftKneeWorld = mediaPipeToWorld(leftKneePos);
				const leftAnkleWorld = mediaPipeToWorld(leftAnklePos);

				// Control left leg bones with flexible naming
				const leftThighBone = findBone(['LeftUpLeg', 'ThighL', 'thigh_L', 'LeftThigh']);
				const leftKneeBone = findBone(['LeftLeg', 'KneeL', 'knee_L', 'LeftKnee']);
				const leftFootBone = findBone(['LeftFoot', 'FootL', 'foot_L', 'LeftAnkle']);

				if (leftThighBone) {
					leftThighBone.position.copy(leftHipWorld);
					const thighRotation = getRotationFromDirection(leftHipWorld, leftKneeWorld);
					leftThighBone.quaternion.copy(thighRotation);
				}

				if (leftKneeBone) {
					leftKneeBone.position.copy(leftKneeWorld);
					const shinRotation = getRotationFromDirection(leftKneeWorld, leftAnkleWorld);
					leftKneeBone.quaternion.copy(shinRotation);
				}

				if (leftFootBone) {
					leftFootBone.position.copy(leftAnkleWorld);
				}
			}

			// Right leg (similar to left leg)
			const rightKneePos = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
			const rightAnklePos = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

			if (
				rightHipPos &&
				rightKneePos &&
				rightAnklePos &&
				rightHipPos.visibility > 0.5 &&
				rightKneePos.visibility > 0.5 &&
				rightAnklePos.visibility > 0.5
			) {
				const rightHipWorld = mediaPipeToWorld(rightHipPos);
				const rightKneeWorld = mediaPipeToWorld(rightKneePos);
				const rightAnkleWorld = mediaPipeToWorld(rightAnklePos);

				// Control right leg bones with flexible naming
				const rightThighBone = findBone(['RightUpLeg', 'ThighR', 'thigh_R', 'RightThigh']);
				const rightKneeBone = findBone(['RightLeg', 'KneeR', 'knee_R', 'RightKnee']);
				const rightFootBone = findBone(['RightFoot', 'FootR', 'foot_R', 'RightAnkle']);

				if (rightThighBone) {
					rightThighBone.position.copy(rightHipWorld);
					const thighRotation = getRotationFromDirection(rightHipWorld, rightKneeWorld);
					rightThighBone.quaternion.copy(thighRotation);
				}

				if (rightKneeBone) {
					rightKneeBone.position.copy(rightKneeWorld);
					const shinRotation = getRotationFromDirection(rightKneeWorld, rightAnkleWorld);
					rightKneeBone.quaternion.copy(shinRotation);
				}

				if (rightFootBone) {
					rightFootBone.position.copy(rightAnkleWorld);
				}
			}
		} catch (error) {
			console.warn('Error updating character bones:', error);
		}
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
			[11, 13],
			[13, 15], // left arm
			[12, 14],
			[14, 16], // right arm
			[11, 23],
			[12, 24],
			[23, 24], // torso
			[23, 25],
			[25, 27],
			[27, 29],
			[29, 31], // left leg
			[24, 26],
			[26, 28],
			[28, 30],
			[30, 32] // right leg
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
			if (
				startIdx < landmarks.length &&
				endIdx < landmarks.length &&
				!excludedIndices.has(startIdx) &&
				!excludedIndices.has(endIdx)
			) {
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
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4], // Thumb
			[0, 5],
			[5, 6],
			[6, 7],
			[7, 8], // Index finger
			[0, 9],
			[9, 10],
			[10, 11],
			[11, 12], // Middle finger
			[0, 13],
			[13, 14],
			[14, 15],
			[15, 16], // Ring finger
			[0, 17],
			[17, 18],
			[18, 19],
			[19, 20], // Pinky
			[5, 9],
			[9, 13],
			[13, 17] // Palm connections
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
			faceContour: [
				10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
				152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
			],

			// Left eyebrow
			leftEyebrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 70],

			// Right eyebrow
			rightEyebrow: [296, 334, 293, 300, 276, 283, 282, 295, 285, 336, 296],

			// Left eye
			leftEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],

			// Right eye
			rightEye: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],

			// Nose
			nose: [
				1, 2, 5, 4, 6, 168, 8, 9, 10, 151, 195, 197, 51, 48, 115, 131, 134, 102, 49, 220, 281, 360,
				279
			],

			// Mouth outer boundary (simplified for clear lines)
			mouthOuter: [
				324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308
			],

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
			leftEyebrow: facialFeatures.leftEyebrow
				.map((_: any, i: number, arr: any[]) => (i < arr.length - 1 ? [arr[i], arr[i + 1]] : null))
				.filter(Boolean),

			rightEyebrow: facialFeatures.rightEyebrow
				.map((_: any, i: number, arr: any[]) => (i < arr.length - 1 ? [arr[i], arr[i + 1]] : null))
				.filter(Boolean),

			leftEye: [
				...facialFeatures.leftEye.map((_: any, i: number, arr: any[]) => [
					arr[i],
					arr[(i + 1) % arr.length]
				])
			],

			rightEye: [
				...facialFeatures.rightEye.map((_: any, i: number, arr: any[]) => [
					arr[i],
					arr[(i + 1) % arr.length]
				])
			],

			// Connect mouth inner as individual line segments
			mouthInner: facialFeatures.mouthInner
				.map((_: any, i: number, arr: any[]) => (i < arr.length - 1 ? [arr[i], arr[i + 1]] : null))
				.filter(Boolean)
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
		switch (type) {
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
		ctx.fillRect(50, height / 3, 100, height / 3);
		ctx.fillRect(width - 150, height / 3, 100, height / 3);
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

		explosions.forEach((explosion) => {
			explosion.particles.forEach((particle) => {
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
		const progress = 1 - gameFlowState.delayRemaining / totalDelay;

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
