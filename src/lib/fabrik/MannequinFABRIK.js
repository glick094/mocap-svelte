import * as THREE from 'three';
import { FABRIK } from './FABRIK.js';

/**
 * MannequinFABRIK integrates FABRIK inverse kinematics with the mannequin model
 * 
 * This class sets up bone chains for different body parts and provides
 * methods to solve IK problems using MediaPipe pose data as targets.
 */
export class MannequinFABRIK {
    constructor(mannequin) {
        this.mannequin = mannequin;
        this.fabrik = new FABRIK();
        this.chains = new Map();
        
        // Configure FABRIK parameters for real-time performance
        this.fabrik.setParameters(8, 0.02); // 8 iterations, 2cm tolerance
        
        this.setupChains();
    }

    /**
     * Set up bone chains for different body parts
     */
    setupChains() {
        // Left arm chain: shoulder -> elbow -> wrist
        this.setupArmChain('leftArm', 'left');
        this.setupArmChain('rightArm', 'right');
        
        // Left leg chain: hip -> knee -> ankle
        this.setupLegChain('leftLeg', 'left');
        this.setupLegChain('rightLeg', 'right');
        
        // Spine chain: pelvis -> torso -> neck -> head
        this.setupSpineChain();
    }

    /**
     * Set up arm chain (shoulder -> elbow -> wrist)
     */
    setupArmChain(chainId, side) {
        const prefix = side === 'left' ? 'l_' : 'r_';
        
        const joints = [
            {
                position: this.getJointWorldPosition(this.mannequin[prefix + 'arm']),
                mannequinJoint: this.mannequin[prefix + 'arm'],
                constraints: {
                    angleLimit: Math.PI * 0.75, // 135 degrees
                    referenceDirection: new THREE.Vector3(0, -1, 0) // Down from shoulder
                }
            },
            {
                position: this.getJointWorldPosition(this.mannequin[prefix + 'elbow']),
                mannequinJoint: this.mannequin[prefix + 'elbow'],
                constraints: {
                    angleLimit: Math.PI * 0.9, // 162 degrees (elbow can bend almost fully)
                    referenceDirection: new THREE.Vector3(0, -1, 0)
                }
            },
            {
                position: this.getJointWorldPosition(this.mannequin[prefix + 'wrist']),
                mannequinJoint: this.mannequin[prefix + 'wrist'],
                constraints: {
                    angleLimit: Math.PI * 0.5, // 90 degrees
                    referenceDirection: new THREE.Vector3(0, -1, 0)
                }
            }
        ];

        this.fabrik.defineChain(chainId, joints, 0);
        this.chains.set(chainId, {
            type: 'arm',
            side: side,
            joints: joints
        });
    }

    /**
     * Set up leg chain (hip -> knee -> ankle)
     */
    setupLegChain(chainId, side) {
        const prefix = side === 'left' ? 'l_' : 'r_';
        
        const joints = [
            {
                position: this.getJointWorldPosition(this.mannequin[prefix + 'leg']),
                mannequinJoint: this.mannequin[prefix + 'leg'],
                constraints: {
                    angleLimit: Math.PI * 0.6, // 108 degrees
                    referenceDirection: new THREE.Vector3(0, -1, 0) // Down from hip
                }
            },
            {
                position: this.getJointWorldPosition(this.mannequin[prefix + 'knee']),
                mannequinJoint: this.mannequin[prefix + 'knee'],
                constraints: {
                    angleLimit: Math.PI * 0.85, // 153 degrees
                    referenceDirection: new THREE.Vector3(0, -1, 0)
                }
            },
            {
                position: this.getJointWorldPosition(this.mannequin[prefix + 'ankle']),
                mannequinJoint: this.mannequin[prefix + 'ankle'],
                constraints: {
                    angleLimit: Math.PI * 0.4, // 72 degrees
                    referenceDirection: new THREE.Vector3(0, -1, 0)
                }
            }
        ];

        this.fabrik.defineChain(chainId, joints, 0);
        this.chains.set(chainId, {
            type: 'leg',
            side: side,
            joints: joints
        });
    }

    /**
     * Set up spine chain (pelvis -> torso -> neck -> head)
     */
    setupSpineChain() {
        const joints = [
            {
                position: this.getJointWorldPosition(this.mannequin.pelvis),
                mannequinJoint: this.mannequin.pelvis,
                constraints: {
                    angleLimit: Math.PI * 0.3, // 54 degrees
                    referenceDirection: new THREE.Vector3(0, 1, 0) // Up from pelvis
                }
            },
            {
                position: this.getJointWorldPosition(this.mannequin.torso),
                mannequinJoint: this.mannequin.torso,
                constraints: {
                    angleLimit: Math.PI * 0.25, // 45 degrees
                    referenceDirection: new THREE.Vector3(0, 1, 0)
                }
            },
            {
                position: this.getJointWorldPosition(this.mannequin.neck),
                mannequinJoint: this.mannequin.neck,
                constraints: {
                    angleLimit: Math.PI * 0.35, // 63 degrees
                    referenceDirection: new THREE.Vector3(0, 1, 0)
                }
            },
            {
                position: this.getJointWorldPosition(this.mannequin.head),
                mannequinJoint: this.mannequin.head,
                constraints: {
                    angleLimit: Math.PI * 0.4, // 72 degrees
                    referenceDirection: new THREE.Vector3(0, 1, 0)
                }
            }
        ];

        this.fabrik.defineChain('spine', joints, 0);
        this.chains.set('spine', {
            type: 'spine',
            joints: joints
        });
    }

    /**
     * Get world position of a mannequin joint
     */
    getJointWorldPosition(joint) {
        const worldPosition = new THREE.Vector3();
        joint.getWorldPosition(worldPosition);
        return worldPosition;
    }

    /**
     * Solve IK for all chains using MediaPipe pose data
     * @param {Object} poseData - MediaPipe pose landmarks
     */
    solveFromPoseData(poseData) {
        if (!poseData.poseLandmarks || poseData.poseLandmarks.length === 0) {
            return;
        }

        const landmarks = poseData.poseLandmarks;
        
        // MediaPipe landmark indices
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

        // Convert MediaPipe coordinates to 3D world coordinates
        const convertToWorldCoords = (landmark) => {
            return new THREE.Vector3(
                (landmark.x - 0.5) * 4, // Scale and center X
                (0.5 - landmark.y) * 3, // Scale and invert Y
                -landmark.z * 2         // Scale Z (depth)
            );
        };

        // Solve left arm IK
        if (this.isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_WRIST])) {
            const target = convertToWorldCoords(landmarks[POSE_LANDMARKS.LEFT_WRIST]);
            const shoulderPos = convertToWorldCoords(landmarks[POSE_LANDMARKS.LEFT_SHOULDER]);
            
            try {
                const positions = this.fabrik.solve('leftArm', target, shoulderPos);
                this.fabrik.updateMannequinJoints('leftArm', positions);
            } catch (error) {
                console.warn('Left arm IK solve failed:', error);
            }
        }

        // Solve right arm IK
        if (this.isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_WRIST])) {
            const target = convertToWorldCoords(landmarks[POSE_LANDMARKS.RIGHT_WRIST]);
            const shoulderPos = convertToWorldCoords(landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]);
            
            try {
                const positions = this.fabrik.solve('rightArm', target, shoulderPos);
                this.fabrik.updateMannequinJoints('rightArm', positions);
            } catch (error) {
                console.warn('Right arm IK solve failed:', error);
            }
        }

        // Solve left leg IK
        if (this.isValidLandmark(landmarks[POSE_LANDMARKS.LEFT_ANKLE])) {
            const target = convertToWorldCoords(landmarks[POSE_LANDMARKS.LEFT_ANKLE]);
            const hipPos = convertToWorldCoords(landmarks[POSE_LANDMARKS.LEFT_HIP]);
            
            try {
                const positions = this.fabrik.solve('leftLeg', target, hipPos);
                this.fabrik.updateMannequinJoints('leftLeg', positions);
            } catch (error) {
                console.warn('Left leg IK solve failed:', error);
            }
        }

        // Solve right leg IK
        if (this.isValidLandmark(landmarks[POSE_LANDMARKS.RIGHT_ANKLE])) {
            const target = convertToWorldCoords(landmarks[POSE_LANDMARKS.RIGHT_ANKLE]);
            const hipPos = convertToWorldCoords(landmarks[POSE_LANDMARKS.RIGHT_HIP]);
            
            try {
                const positions = this.fabrik.solve('rightLeg', target, hipPos);
                this.fabrik.updateMannequinJoints('rightLeg', positions);
            } catch (error) {
                console.warn('Right leg IK solve failed:', error);
            }
        }

        // Solve spine IK (head as target)
        if (this.isValidLandmark(landmarks[POSE_LANDMARKS.NOSE])) {
            const target = convertToWorldCoords(landmarks[POSE_LANDMARKS.NOSE]);
            
            // Use average hip position as base
            const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
            const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
            
            if (this.isValidLandmark(leftHip) && this.isValidLandmark(rightHip)) {
                const avgHip = {
                    x: (leftHip.x + rightHip.x) / 2,
                    y: (leftHip.y + rightHip.y) / 2,
                    z: (leftHip.z + rightHip.z) / 2
                };
                const basePos = convertToWorldCoords(avgHip);
                
                try {
                    const positions = this.fabrik.solve('spine', target, basePos);
                    this.fabrik.updateMannequinJoints('spine', positions);
                } catch (error) {
                    console.warn('Spine IK solve failed:', error);
                }
            }
        }
    }

    /**
     * Check if a landmark is valid and visible
     */
    isValidLandmark(landmark) {
        return landmark && 
               landmark.visibility > 0.5 && 
               landmark.x >= -0.2 && landmark.x <= 1.2 &&
               landmark.y >= -0.2 && landmark.y <= 1.2;
    }

    /**
     * Solve IK for a specific chain with a target position
     * @param {string} chainId - Chain identifier
     * @param {THREE.Vector3} target - Target position
     * @param {THREE.Vector3} basePosition - Optional base position
     */
    solveChain(chainId, target, basePosition = null) {
        try {
            const positions = this.fabrik.solve(chainId, target, basePosition);
            this.fabrik.updateMannequinJoints(chainId, positions);
            return positions;
        } catch (error) {
            console.warn(`Chain ${chainId} IK solve failed:`, error);
            return null;
        }
    }

    /**
     * Reset all chains to original positions
     */
    resetAllChains() {
        this.chains.forEach((chainInfo, chainId) => {
            this.fabrik.resetChain(chainId);
        });
    }

    /**
     * Reset a specific chain
     */
    resetChain(chainId) {
        this.fabrik.resetChain(chainId);
    }

    /**
     * Update chain parameters
     */
    updateParameters(maxIterations, tolerance) {
        this.fabrik.setParameters(maxIterations, tolerance);
    }

    /**
     * Get chain information
     */
    getChainInfo(chainId) {
        return this.chains.get(chainId);
    }

    /**
     * Get all available chain IDs
     */
    getChainIds() {
        return Array.from(this.chains.keys());
    }

    /**
     * Enable/disable IK for specific chains
     */
    setChainEnabled(chainId, enabled) {
        const chainInfo = this.chains.get(chainId);
        if (chainInfo) {
            chainInfo.enabled = enabled;
        }
    }

    /**
     * Check if chain is enabled
     */
    isChainEnabled(chainId) {
        const chainInfo = this.chains.get(chainId);
        return chainInfo ? chainInfo.enabled !== false : false;
    }

    /**
     * Apply IK only to enabled chains
     */
    solveEnabledChains(poseData) {
        // Store original solve method
        const originalSolve = this.fabrik.solve.bind(this.fabrik);
        
        // Override solve to check enabled status
        this.fabrik.solve = (chainId, target, basePosition) => {
            if (this.isChainEnabled(chainId)) {
                return originalSolve(chainId, target, basePosition);
            }
            return null;
        };
        
        // Solve with enabled chains only
        this.solveFromPoseData(poseData);
        
        // Restore original solve method
        this.fabrik.solve = originalSolve;
    }
}

export default MannequinFABRIK;