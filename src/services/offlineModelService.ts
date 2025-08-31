/**
 * Offline Model Service
 * Handles local MediaPipe model detection and fallback to CDN
 */

// Check if local models are available
export async function checkLocalModelsAvailable(): Promise<boolean> {
  try {
    // Test if we can access a required model file locally
    const testFile = '/models/holistic/holistic.binarypb';
    const response = await fetch(`${window.location.origin}${testFile}`, { 
      method: 'HEAD',
      cache: 'no-cache' 
    });
    return response.ok;
  } catch (error) {
    console.log('Local MediaPipe models not available, will use CDN fallback');
    return false;
  }
}

// Check if internet connection is available by testing a lightweight endpoint
async function checkInternetConnection(): Promise<boolean> {
  try {
    // Use a much faster connectivity test with a lightweight endpoint
    await fetch('https://httpbin.org/status/200', { 
      method: 'HEAD', 
      cache: 'no-cache',
      mode: 'no-cors',
      signal: AbortSignal.timeout(1500) // 1.5 second timeout for fast response
    });
    console.log('✅ Internet connection available');
    return true;
  } catch (error) {
    console.log('🌐 No internet connection detected (fast test)');
    return false;
  }
}

// Get the appropriate locateFile function - WEB FIRST, offline fallback
export async function getMediaPipeLocateFile(): Promise<(file: string) => string> {
  // Priority 1: Try CDN first (for GitHub Pages and normal web use)
  const hasInternet = await checkInternetConnection();
  
  if (hasInternet) {
    console.log('🌐 Using CDN MediaPipe models (web mode - default)');
    
    const cdnOptions = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629',
      'https://cdn.jsdelivr.net/npm/@mediapipe/holistic',
      'https://unpkg.com/@mediapipe/holistic@0.5.1675471629',
      'https://unpkg.com/@mediapipe/holistic'
    ];
    
    // Set global flag for UI display
    (globalThis as any).mediaPipeMode = 'web';
    
    // Return the primary CDN (we already tested it works)
    console.log(`✅ Using primary CDN: ${cdnOptions[0]}`);
    return (file: string) => `${cdnOptions[0]}/${file}`;
  } 
  
  // Priority 2: Fallback to local models if no internet
  console.log('🔌 No internet connection - checking for local models...');
  const hasLocalModels = await checkLocalModelsAvailable();
  
  if (hasLocalModels) {
    console.log('✅ Using local MediaPipe models (offline fallback mode)');
    // Set global flag for UI display
    (globalThis as any).mediaPipeMode = 'offline';
    return (file: string) => `${window.location.origin}/models/holistic/${file}`;
  } else {
    console.log('❌ No local models found - please run "npm run setup-offline" first');
    console.log('⚠️ Attempting CDN anyway (will likely fail without internet)');
    
    // Set global flag for UI display
    (globalThis as any).mediaPipeMode = 'failed';
    
    // Last resort: try CDN anyway (for error messages)
    const cdnOptions = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629',
      'https://cdn.jsdelivr.net/npm/@mediapipe/holistic'
    ];
    
    return (file: string) => `${cdnOptions[0]}/${file}`;
  }
}

// Create MediaPipe configuration with automatic model detection
export async function createMediaPipeConfig() {
  const locateFile = await getMediaPipeLocateFile();
  
  return {
    locateFile,
    // Additional MediaPipe configuration can be added here
    selfieMode: false,
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  };
}