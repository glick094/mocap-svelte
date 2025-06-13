<script>
  import { onMount, onDestroy } from 'svelte';

  let canvasElement;
  let ctx;
  let animationId;

  // Component props
  export let width = 800;
  export let height = 600;
  export let poseData = null;

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
      // Draw placeholder text
      ctx.fillStyle = '#666';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for pose data...', width / 2, height / 2);
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
    
    // Draw connections first (behind landmarks)
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    
    connections.forEach(([startIdx, endIdx]) => {
      if (startIdx < landmarks.length && endIdx < landmarks.length &&
          !excludedIndices.has(startIdx) && !excludedIndices.has(endIdx)) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        
        if (start.visibility > 0.5 && end.visibility > 0.5) {
          ctx.beginPath();
          ctx.moveTo(start.x * width, start.y * height);
          ctx.lineTo(end.x * width, end.y * height);
          ctx.stroke();
        }
      }
    });
    
    // Draw landmark points (excluding face points 1-10)
    ctx.fillStyle = '#00ff88';
    landmarks.forEach((landmark, index) => {
      if (!excludedIndices.has(index) && landmark.visibility && landmark.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc(landmark.x * width, landmark.y * height, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }

  function drawHandLandmarks(landmarks, hand) {
    if (!landmarks || landmarks.length === 0) return;
    
    const color = hand === 'left' ? '#ff0000' : '#0000ff';
    
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
      nose: [1, 2, 5, 4, 6, 168, 8, 9, 10, 151, 195, 197, 196, 3, 51, 48, 115, 131, 134, 102, 49, 220, 305, 281, 360, 279],
      
      // Mouth outer boundary (simplified for clear lines)
      // mouthOuter: [61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
      mouthOuter: [324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
      
      // Mouth inner opening (simplified for clear lines) 
      mouthInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 324]
    };
    
    // Draw each facial feature with different colors
    const featureColors = {
      faceContour: '#ffff00',
      leftEyebrow: '#ff8800',
      rightEyebrow: '#ff8800', 
      leftEye: '#00ffff',
      rightEye: '#00ffff',
      nose: '#ff00ff',
      mouthOuter: '#ff0088',
      mouthInner: '#ff4444'
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
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1;
      } else if (featureName.includes('Eyebrow')) {
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 1;
      } else if (featureName.includes('mouth')) {
        ctx.strokeStyle = '#ff0088'; // Pink lines for mouth
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
  }
</style>