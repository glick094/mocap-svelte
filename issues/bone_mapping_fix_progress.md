# Bone Mapping Fix Progress

## Issue Summary
The IK solver was failing because bone indices were -1, indicating that bones found during character model traversal weren't matching the bones in the SkinnedMesh skeleton.

## Root Cause
The problem was in `setupIKSolver()` function at lines 701-702. We were using `skeleton.bones.indexOf(chain.effector)` to find bone indices, but this compares object references. The bones collected during `characterModel.traverse()` are different object instances than the bones in `skinnedMesh.skeleton.bones`, even though they represent the same bones.

## Solution Implemented
1. **Changed bone index lookup from object reference to name matching:**
   - Added `findBoneIndexByName()` helper function 
   - Uses `skeleton.bones.findIndex((bone) => bone.name === boneName)` instead of `indexOf()`
   - This matches bones by name rather than object reference

2. **Fixed TypeScript compilation errors:**
   - Added proper type casting for `skinnedMesh` variable
   - Used `(skinnedMesh as THREE.SkinnedMesh).skeleton` to access skeleton property

## Code Changes Made
- File: `src/components/ThreeJSCanvas.svelte`
- Lines 698-701: Added `findBoneIndexByName()` helper function
- Lines 706-707: Changed to use name-based bone index lookup
- Line 693: Fixed TypeScript typing for skeleton access

## Expected Result
The IK solver should now:
1. Successfully find bone indices (no more -1 values)
2. Create valid IK chains for arms and legs
3. Initialize CCDIKSolver without errors

## Next Steps
1. Test in browser to verify bone indices are now valid
2. Confirm IK solver initializes successfully
3. Test MediaPipe to IK target mapping for real-time animation

## Status
- ✅ Root cause identified
- ✅ Fix implemented
- ✅ TypeScript compilation fixed 
- 🔄 Testing in progress