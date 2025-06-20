<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import QrScanner from 'qr-scanner';

  const dispatch = createEventDispatcher();

  export let isOpen = false;
  export let cameraStream: MediaStream | null = null;

  let videoElement: HTMLVideoElement;
  let qrScanner: QrScanner | null = null;
  let stream: MediaStream | null = null;
  let isScanning = false;
  let error: string | null = null;
  let scanResult: string | null = null;
  let hasStarted = false;
  let isClosing = false;

  async function startCamera() {
    // Prevent multiple starts or starting while closing
    if (hasStarted || isClosing || !isOpen) {
      return;
    }

    try {
      hasStarted = true;
      error = null;
      console.log('Starting QR scanner camera...');
      
      // Use existing camera stream if available, otherwise get new one
      if (cameraStream) {
        stream = cameraStream;
        console.log('Using existing camera stream for QR scanner');
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });
        console.log('Created new camera stream for QR scanner');
      }

      // Check if still open before proceeding
      if (!isOpen || isClosing) {
        stopCamera();
        return;
      }

      // Set up video
      videoElement.srcObject = stream;
      await videoElement.play();
      
      // Wait for video to be ready
      await new Promise((resolve) => {
        const checkVideo = () => {
          if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            console.log('Video dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
            resolve(true);
          } else {
            setTimeout(checkVideo, 100);
          }
        };
        checkVideo();
      });

      // Initialize QR Scanner
      qrScanner = new QrScanner(
        videoElement,
        (result) => {
          if (!isClosing) {
            console.log('QR Code detected:', result);
            const resultString = result.data || result;
            console.log('QR Code result string:', resultString);
            scanResult = resultString;
            handleQRResult(resultString);
          }
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
          maxScansPerSecond: 10,
          preferredCamera: 'environment',
          calculateScanRegion: (video) => {
            const smallerDimension = Math.min(video.videoWidth, video.videoHeight);
            const scanRegionSize = Math.round(0.6 * smallerDimension);
            const x = Math.round((video.videoWidth - scanRegionSize) / 2);
            const y = Math.round((video.videoHeight - scanRegionSize) / 2);
            return {
              x,
              y,
              width: scanRegionSize,
              height: scanRegionSize,
            };
          },
        }
      );

      // Check if still open before starting scanner
      if (!isOpen || isClosing) {
        stopCamera();
        return;
      }

      await qrScanner.start();
      isScanning = true;
      console.log('QR Scanner started successfully');
      
      // Add periodic status logging
      const statusInterval = setInterval(() => {
        if (isScanning && !isClosing) {
          console.log('QR Scanner status: actively scanning...');
        } else {
          clearInterval(statusInterval);
        }
      }, 3000);

    } catch (err: any) {
      console.error('Failed to start QR scanner:', err);
      error = err.message || 'Failed to start camera';
      isScanning = false;
      hasStarted = false;
    }
  }

  function handleQRResult(result: string) {
    if (isClosing) return; // Prevent multiple handling
    
    try {
      // Try to parse as JSON for participant data
      const parsed = JSON.parse(result);
      if (parsed.participantid || parsed.participantId) {
        dispatch('qrCodeDetected', result);
        close();
      } else {
        scanResult = `Found QR code but missing participant data: ${result}`;
      }
    } catch (e) {
      // Not valid JSON, but still a QR code
      scanResult = `QR code found: ${result}`;
      dispatch('qrCodeDetected', result);
      close();
    }
  }

  function close() {
    if (isClosing) return; // Prevent multiple close calls
    isClosing = true;
    stopCamera();
    isOpen = false;
    dispatch('close');
  }

  function stopCamera() {
    if (qrScanner) {
      try {
        qrScanner.stop();
        qrScanner.destroy();
      } catch (e) {
        console.warn('Error stopping QR scanner:', e);
      }
      qrScanner = null;
    }

    // Only stop the stream if we created it ourselves (not sharing with MediaPipe)
    if (stream && !cameraStream) {
      stream.getTracks().forEach(track => track.stop());
    }
    stream = null;

    isScanning = false;
    hasStarted = false;
    error = null;
    scanResult = null;
  }

  // Start camera when modal opens (only once)
  $: if (isOpen && videoElement && !hasStarted && !isClosing) {
    startCamera();
  }

  // Stop camera when modal closes
  $: if (!isOpen && !isClosing) {
    isClosing = true;
    stopCamera();
    // Reset closing flag after a brief delay
    setTimeout(() => {
      isClosing = false;
    }, 100);
  }

  onDestroy(() => {
    stopCamera();
  });
</script>

{#if isOpen}
  <div class="modal-overlay" on:click={close} on:keydown={(e) => e.key === 'Escape' && close()} role="button" tabindex="0">
    <div class="modal-content" on:click|stopPropagation on:keydown role="dialog" tabindex="0">
      <div class="modal-header">
        <h3>Scan QR Code</h3>
        <button class="close-btn" on:click={close}>&times;</button>
      </div>
      
      <div class="modal-body">
        <div class="video-container">
          <video
            bind:this={videoElement}
            class="qr-video"
            autoplay
            playsinline
            muted
          ></video>
          
          {#if error}
            <div class="error-message">
              <p>❌ {error}</p>
              <button on:click={startCamera}>Try Again</button>
            </div>
          {:else if isScanning}
            <div class="scanning-overlay">
              <div class="scan-indicator">
                <div class="scan-line"></div>
              </div>
              <p class="scan-instruction">Position QR code in the center of the camera view</p>
              <p class="scan-status">Scanner active - Looking for QR codes...</p>
            </div>
          {:else}
            <div class="loading-message">
              <p>📷 Starting camera...</p>
            </div>
          {/if}
          
          {#if scanResult}
            <div class="scan-result">
              <p>✅ {scanResult}</p>
            </div>
          {/if}
        </div>
        
        <div class="modal-instructions">
          <p><strong>Instructions:</strong></p>
          <ul>
            <li>Point your camera at a QR code containing participant data</li>
            <li>QR code should contain JSON with "participantid", "age", and "height"</li>
            <li>Keep the QR code steady and well-lit</li>
            <li>The scanner will automatically detect and close when successful</li>
          </ul>
          
          <div class="test-section">
            <p><strong>Test:</strong></p>
            <button class="test-btn" on:click={() => handleQRResult('{"participantid": "test_001", "age": "25", "height": "70in"}')}>
              Test with Sample QR Data
            </button>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="cancel-btn" on:click={close}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-content {
    background: #1a1a1a;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    max-width: 600px;
    width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    color: white;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .modal-header h3 {
    margin: 0;
    color: #00ff88;
  }

  .close-btn {
    background: none;
    border: none;
    color: #ccc;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: white;
  }

  .modal-body {
    padding: 1.5rem;
  }

  .video-container {
    position: relative;
    background: black;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .qr-video {
    width: 100%;
    height: auto;
    display: block;
    max-height: 400px;
  }

  .scanning-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: rgba(0, 0, 0, 0.3);
    color: white;
  }

  .scan-indicator {
    width: 200px;
    height: 200px;
    border: 2px solid #00ff88;
    border-radius: 8px;
    position: relative;
    margin-bottom: 1rem;
  }

  .scan-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: #00ff88;
    animation: scan 2s linear infinite;
  }

  @keyframes scan {
    0% { transform: translateY(0); }
    100% { transform: translateY(196px); }
  }

  .scan-instruction {
    text-align: center;
    background: rgba(0, 0, 0, 0.8);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    margin: 0 0 0.5rem 0;
  }

  .scan-status {
    text-align: center;
    background: rgba(0, 255, 136, 0.8);
    color: black;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    margin: 0;
    font-size: 0.8rem;
  }

  .error-message, .loading-message, .scan-result {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    padding: 1rem;
    border-radius: 8px;
    text-align: center;
    color: white;
  }

  .error-message p {
    color: #ff4444;
    margin-bottom: 0.5rem;
  }

  .error-message button {
    background: #667eea;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .scan-result p {
    color: #00ff88;
    margin: 0;
  }

  .modal-instructions {
    background: rgba(255, 255, 255, 0.1);
    padding: 1rem;
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .modal-instructions p {
    margin: 0 0 0.5rem 0;
    color: #00ff88;
  }

  .modal-instructions ul {
    margin: 0;
    padding-left: 1.2rem;
    color: #ccc;
  }

  .modal-instructions li {
    margin-bottom: 0.25rem;
  }

  .test-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
  }

  .test-btn {
    background: #00ff88;
    color: black;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }

  .test-btn:hover {
    background: #00dd77;
  }

  .modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    text-align: right;
  }

  .cancel-btn {
    background: #666;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .cancel-btn:hover {
    background: #777;
  }

  @media (max-width: 768px) {
    .modal-content {
      width: 95vw;
      max-height: 95vh;
    }
    
    .modal-body {
      padding: 1rem;
    }
    
    .scan-indicator {
      width: 150px;
      height: 150px;
    }
  }
</style>