<script>
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';

  let canvasElement;
  let scene, camera, renderer, cube;
  let animationId;

  // Component props
  export let width = 800;
  export let height = 600;
  export let frameColor = '#333';
  export let frameWidth = '4px';

  onMount(() => {
    initThreeJS();
    animate();
  });

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    if (renderer) {
      renderer.dispose();
    }
  });

  function initThreeJS() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Create camera
    camera = new THREE.PerspectiveCamera(
      75, 
      width / height, 
      0.1, 
      1000
    );
    camera.position.z = 5;

    // Create renderer
    renderer = new THREE.WebGLRenderer({ 
      canvas: canvasElement,
      antialias: true 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Create a cube
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshPhongMaterial({ 
      color: 0x00ff88,
      shininess: 100 
    });
    cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);

    // Add some visual interest with wireframe overlay
    const wireframeGeometry = new THREE.EdgesGeometry(geometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.3, transparent: true });
    const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
    cube.add(wireframe);
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    // Rotate the cube
    if (cube) {
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
    }

    // Render the scene
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // Handle window resize
  function handleResize() {
    if (camera && renderer) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
  }

  // Reactive statement to handle prop changes
  $: if (renderer && camera) {
    handleResize();
  }
</script>

<div class="threejs-container" style="--frame-color: {frameColor}; --frame-width: {frameWidth};">
  <div class="canvas-frame">
    <canvas bind:this={canvasElement} {width} {height}></canvas>
    <div class="frame-overlay">
      <div class="corner top-left"></div>
      <div class="corner top-right"></div>
      <div class="corner bottom-left"></div>
      <div class="corner bottom-right"></div>
    </div>
  </div>
  <div class="info-panel">
    <h3>Three.js Canvas</h3>
    <p>Size: {width} × {height}</p>
    <p>Scene objects: {scene ? scene.children.length : 0}</p>
  </div>
</div>

<style>
  .threejs-container {
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
</style>