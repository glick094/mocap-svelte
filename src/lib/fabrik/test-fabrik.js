import * as THREE from 'three';
import { FABRIK } from './FABRIK.js';

/**
 * Simple test to verify FABRIK implementation
 */
export function testFABRIK() {
    console.log('Testing FABRIK implementation...');
    
    const fabrik = new FABRIK();
    
    // Create a simple 3-joint chain
    const joints = [
        {
            position: new THREE.Vector3(0, 0, 0),
            constraints: null
        },
        {
            position: new THREE.Vector3(0, 1, 0),
            constraints: null
        },
        {
            position: new THREE.Vector3(0, 2, 0),
            constraints: null
        }
    ];
    
    try {
        // Define the chain
        fabrik.defineChain('testChain', joints);
        console.log('✓ Chain definition successful');
        
        // Test reachable target
        const reachableTarget = new THREE.Vector3(1, 1, 0);
        const result1 = fabrik.solve('testChain', reachableTarget);
        console.log('✓ Reachable target solve successful:', result1);
        
        // Test unreachable target
        const unreachableTarget = new THREE.Vector3(5, 5, 0);
        const result2 = fabrik.solve('testChain', unreachableTarget);
        console.log('✓ Unreachable target solve successful:', result2);
        
        // Test with base constraint
        const basePosition = new THREE.Vector3(0, 0, 0);
        const result3 = fabrik.solve('testChain', reachableTarget, basePosition);
        console.log('✓ Base-constrained solve successful:', result3);
        
        console.log('FABRIK tests completed successfully!');
        return true;
        
    } catch (error) {
        console.error('FABRIK test failed:', error);
        return false;
    }
}

// Auto-run test when imported
if (typeof window !== 'undefined') {
    testFABRIK();
}