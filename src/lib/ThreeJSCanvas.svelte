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

<div class="canvas-container" style="--frame-color: {frameColor}; --frame-width: {frameWidth};">
  <div class="canvas-frame">
    <canvas 
      bind:this={canvasElement} 
      {width} 
      {height}
    ></canvas>
    <div class="frame-overlay">
      <div class="corner top-left"></div>
      <div class="corner top-right"></div>
      <div class="corner bottom-left"></div>
      <div class="corner bottom-right"></div>
    </div>
  </div>
  <div class="info-panel">
    <h3>2D Pose Visualization</h3>
    <p>Canvas: {width} × {height}</p>
    {#if poseData}
      <p class="pose-status active">✅ Live pose tracking</p>
      <p>Body: {poseData.poseLandmarks ? poseData.poseLandmarks.length : 0} landmarks</p>
      <p>Hands: {(poseData.leftHandLandmarks?.length || 0) + (poseData.rightHandLandmarks?.length || 0)} landmarks</p>
      <p>Face: {poseData.faceLandmarks ? poseData.faceLandmarks.length : 0} landmarks</p>
    {:else}
      <p class="pose-status inactive">⭕ Waiting for pose data</p>
      <p>Enable camera to start tracking</p>
    {/if}
  </div>
</div>

<style>
  .canvas-container {
    display: inline-block;
    font-family: 'Courier New', monospace;
    background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .canvas-frame {
    position: relative;
    display: inline-block;
    border: var(--frame-width) solid var(--frame-color);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 
      inset 0 0 0 2px rgba(255, 255, 255, 0.1),
      0 4px 16px rgba(0, 0, 0, 0.2);
  }

  canvas {
    display: block;
    background: #000;
  }

  .frame-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .corner {
    position: absolute;
    width: 20px;
    height: 20px;
    border: 2px solid rgba(0, 255, 136, 0.6);
  }

  .corner.top-left {
    top: 8px;
    left: 8px;
    border-right: none;
    border-bottom: none;
  }

  .corner.top-right {
    top: 8px;
    right: 8px;
    border-left: none;
    border-bottom: none;
  }

  .corner.bottom-left {
    bottom: 8px;
    left: 8px;
    border-right: none;
    border-top: none;
  }

  .corner.bottom-right {
    bottom: 8px;
    right: 8px;
    border-left: none;
    border-top: none;
  }

  .info-panel {
    margin-top: 16px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 6px;
    border: 1px solid rgba(0, 255, 136, 0.3);
  }

  .info-panel h3 {
    margin: 0 0 8px 0;
    color: #00ff88;
    font-size: 16px;
    font-weight: bold;
  }

  .info-panel p {
    margin: 4px 0;
    color: #ccc;
    font-size: 12px;
  }
  
  .pose-status.active {
    color: #00ff88;
    font-weight: bold;
  }
  
  .pose-status.inactive {
    color: #ff6b6b;
    font-weight: bold;
  }
</style>