<script>
  import { onMount, onDestroy } from 'svelte';

  let canvasElement;
  let ctx;
  let animationId;

  // Component props
  export let width = 800;
  export let height = 600;
  export let frameColor = '#333';
  export let frameWidth = '4px';
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
    
    // MediaPipe pose connections (key body landmarks)
    const connections = [
      [11, 12], // shoulders
      [11, 13], [13, 15], // left arm
      [12, 14], [14, 16], // right arm
      [11, 23], [12, 24], [23, 24], // torso
      [23, 25], [25, 27], [27, 29], [29, 31], // left leg
      [24, 26], [26, 28], [28, 30], [30, 32], // right leg
    ];
    
    // Draw connections first (behind landmarks)
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    
    connections.forEach(([startIdx, endIdx]) => {
      if (startIdx < landmarks.length && endIdx < landmarks.length) {
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
    
    // Draw landmark points
    ctx.fillStyle = '#00ff88';
    landmarks.forEach((landmark) => {
      if (landmark.visibility && landmark.visibility > 0.5) {
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
    
    // Draw key face landmarks (face outline)
    const faceContourIndices = [10, 151, 9, 8, 168, 6, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127];
    
    ctx.fillStyle = '#ffff00';
    faceContourIndices.forEach((index) => {
      if (index < landmarks.length) {
        const landmark = landmarks[index];
        ctx.beginPath();
        ctx.arc(landmark.x * width, landmark.y * height, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
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