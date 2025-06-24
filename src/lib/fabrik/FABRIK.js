import * as THREE from 'three';

/**
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) implementation
 * 
 * This class provides inverse kinematics solving for bone chains using the FABRIK algorithm.
 * FABRIK is particularly well-suited for real-time applications because it's computationally
 * efficient and produces natural-looking results.
 * 
 * Algorithm overview:
 * 1. Forward pass: Start from end effector, move each joint towards target
 * 2. Backward pass: Restore distances, move each joint back towards base
 * 3. Repeat until convergence or max iterations reached
 */
export class FABRIK {
    constructor() {
        this.maxIterations = 10;
        this.tolerance = 0.01;
        this.chains = new Map();
    }

    /**
     * Define a bone chain for FABRIK solving
     * @param {string} chainId - Unique identifier for the chain
     * @param {Array} joints - Array of joint objects with position and constraints
     * @param {number} baseIndex - Index of the base joint (typically 0)
     */
    defineChain(chainId, joints, baseIndex = 0) {
        // Validate inputs
        if (!joints || joints.length < 2) {
            throw new Error('Chain must have at least 2 joints');
        }

        // Calculate bone lengths (distances between consecutive joints)
        const boneLengths = [];
        for (let i = 0; i < joints.length - 1; i++) {
            const distance = joints[i].position.distanceTo(joints[i + 1].position);
            boneLengths.push(distance);
        }

        // Calculate total chain length
        const totalLength = boneLengths.reduce((sum, length) => sum + length, 0);

        const chain = {
            joints: joints.map(joint => ({
                position: joint.position.clone(),
                originalPosition: joint.position.clone(),
                constraints: joint.constraints || null,
                mannequinJoint: joint.mannequinJoint || null
            })),
            boneLengths,
            totalLength,
            baseIndex
        };

        this.chains.set(chainId, chain);
        return chain;
    }

    /**
     * Solve FABRIK for a specific chain
     * @param {string} chainId - Chain identifier
     * @param {THREE.Vector3} target - Target position for end effector
     * @param {THREE.Vector3} basePosition - Optional base position constraint
     * @returns {Array} Array of joint positions after solving
     */
    solve(chainId, target, basePosition = null) {
        const chain = this.chains.get(chainId);
        if (!chain) {
            throw new Error(`Chain ${chainId} not found`);
        }

        const joints = chain.joints;
        const boneLengths = chain.boneLengths;
        const baseIndex = chain.baseIndex;
        const endIndex = joints.length - 1;

        // Check if target is reachable
        const baseToTarget = basePosition ? 
            basePosition.distanceTo(target) : 
            joints[baseIndex].position.distanceTo(target);

        if (baseToTarget > chain.totalLength) {
            // Target is unreachable - stretch chain towards target
            this.stretchToTarget(chain, target, basePosition);
            return this.getJointPositions(chain);
        }

        // FABRIK iterations
        for (let iteration = 0; iteration < this.maxIterations; iteration++) {
            // Forward pass (from end effector to base)
            joints[endIndex].position.copy(target);
            
            for (let i = endIndex - 1; i >= 0; i--) {
                const direction = new THREE.Vector3()
                    .subVectors(joints[i].position, joints[i + 1].position)
                    .normalize()
                    .multiplyScalar(boneLengths[i]);
                
                joints[i].position.copy(joints[i + 1].position).add(direction);
                
                // Apply joint constraints
                this.applyConstraints(joints[i], i, chain);
            }

            // Backward pass (from base to end effector)
            if (basePosition) {
                joints[baseIndex].position.copy(basePosition);
            }
            
            for (let i = baseIndex; i < endIndex; i++) {
                const direction = new THREE.Vector3()
                    .subVectors(joints[i + 1].position, joints[i].position)
                    .normalize()
                    .multiplyScalar(boneLengths[i]);
                
                joints[i + 1].position.copy(joints[i].position).add(direction);
                
                // Apply joint constraints
                this.applyConstraints(joints[i + 1], i + 1, chain);
            }

            // Check convergence
            if (joints[endIndex].position.distanceTo(target) < this.tolerance) {
                break;
            }
        }

        return this.getJointPositions(chain);
    }

    /**
     * Stretch chain towards unreachable target
     */
    stretchToTarget(chain, target, basePosition) {
        const joints = chain.joints;
        const boneLengths = chain.boneLengths;
        const baseIndex = chain.baseIndex;

        const basePos = basePosition || joints[baseIndex].position;
        const direction = new THREE.Vector3().subVectors(target, basePos).normalize();

        // Position each joint along the direction to target
        let currentPos = basePos.clone();
        joints[baseIndex].position.copy(currentPos);

        for (let i = baseIndex; i < joints.length - 1; i++) {
            currentPos.add(direction.clone().multiplyScalar(boneLengths[i]));
            joints[i + 1].position.copy(currentPos);
        }
    }

    /**
     * Apply constraints to a joint
     */
    applyConstraints(joint, index, chain) {
        if (!joint.constraints) return;

        const constraints = joint.constraints;
        
        // Apply positional constraints (e.g., joint limits)
        if (constraints.minPosition && constraints.maxPosition) {
            joint.position.clamp(constraints.minPosition, constraints.maxPosition);
        }

        // Apply angular constraints (for more complex joint types)
        if (constraints.angleLimit && index > 0) {
            const prevJoint = chain.joints[index - 1];
            const currentDirection = new THREE.Vector3()
                .subVectors(joint.position, prevJoint.position)
                .normalize();

            // Check if angle constraint is violated
            if (constraints.referenceDirection) {
                const angle = currentDirection.angleTo(constraints.referenceDirection);
                if (angle > constraints.angleLimit) {
                    // Clamp to maximum allowed angle
                    const clampedDirection = currentDirection
                        .lerp(constraints.referenceDirection, 
                             (angle - constraints.angleLimit) / angle)
                        .normalize();
                    
                    const distance = prevJoint.position.distanceTo(joint.position);
                    joint.position.copy(prevJoint.position)
                        .add(clampedDirection.multiplyScalar(distance));
                }
            }
        }
    }

    /**
     * Get current joint positions
     */
    getJointPositions(chain) {
        return chain.joints.map(joint => joint.position.clone());
    }

    /**
     * Update mannequin joint rotations based on FABRIK solution
     * @param {string} chainId - Chain identifier
     * @param {Array} positions - Joint positions from FABRIK solve
     */
    updateMannequinJoints(chainId, positions) {
        const chain = this.chains.get(chainId);
        if (!chain) return;

        for (let i = 0; i < chain.joints.length - 1; i++) {
            const joint = chain.joints[i];
            if (!joint.mannequinJoint) continue;

            const nextPos = positions[i + 1];
            const currentPos = positions[i];
            
            // Calculate direction vector
            const direction = new THREE.Vector3()
                .subVectors(nextPos, currentPos)
                .normalize();

            // Convert direction to rotation
            const rotation = this.directionToRotation(direction, joint.mannequinJoint);
            
            // Apply rotation to mannequin joint
            this.applyRotationToJoint(joint.mannequinJoint, rotation);
        }
    }

    /**
     * Convert direction vector to rotation angles
     */
    directionToRotation(direction, mannequinJoint) {
        // Create rotation matrix from direction
        const matrix = new THREE.Matrix4();
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(up, direction).normalize();
        const actualUp = new THREE.Vector3().crossVectors(direction, right);

        matrix.makeBasis(right, actualUp, direction);
        
        // Extract Euler angles
        const euler = new THREE.Euler().setFromRotationMatrix(matrix, 'XYZ');
        
        return {
            x: euler.x * 180 / Math.PI,
            y: euler.y * 180 / Math.PI,
            z: euler.z * 180 / Math.PI
        };
    }

    /**
     * Apply rotation to mannequin joint
     */
    applyRotationToJoint(mannequinJoint, rotation) {
        // Map to mannequin joint properties based on joint type
        if (mannequinJoint.bend !== undefined) {
            mannequinJoint.bend = rotation.x;
        }
        if (mannequinJoint.turn !== undefined) {
            mannequinJoint.turn = rotation.y;
        }
        if (mannequinJoint.tilt !== undefined) {
            mannequinJoint.tilt = rotation.z;
        }
        if (mannequinJoint.raise !== undefined) {
            mannequinJoint.raise = rotation.x;
        }
        if (mannequinJoint.straddle !== undefined) {
            mannequinJoint.straddle = rotation.z;
        }
    }

    /**
     * Create a chain from mannequin joints
     * @param {string} chainId - Chain identifier
     * @param {Array} mannequinJoints - Array of mannequin joint objects
     * @param {Function} positionExtractor - Function to extract world position from mannequin joint
     */
    createChainFromMannequin(chainId, mannequinJoints, positionExtractor) {
        const joints = mannequinJoints.map(joint => ({
            position: positionExtractor(joint),
            mannequinJoint: joint,
            constraints: this.getDefaultConstraints()
        }));
        
        return this.defineChain(chainId, joints);
    }

    /**
     * Get default joint constraints
     */
    getDefaultConstraints() {
        return {
            angleLimit: Math.PI / 2, // 90 degrees
            referenceDirection: new THREE.Vector3(0, 1, 0)
        };
    }

    /**
     * Reset chain to original positions
     */
    resetChain(chainId) {
        const chain = this.chains.get(chainId);
        if (!chain) return;

        chain.joints.forEach(joint => {
            joint.position.copy(joint.originalPosition);
        });
    }

    /**
     * Set algorithm parameters
     */
    setParameters(maxIterations, tolerance) {
        this.maxIterations = maxIterations || this.maxIterations;
        this.tolerance = tolerance || this.tolerance;
    }
}