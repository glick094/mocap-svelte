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

// Get the appropriate locateFile function based on availability
export async function getMediaPipeLocateFile(): Promise<(file: string) => string> {
  const hasLocalModels = await checkLocalModelsAvailable();
  
  if (hasLocalModels) {
    console.log('✅ Using local MediaPipe models (offline mode)');
    return (file: string) => `${window.location.origin}/models/holistic/${file}`;
  } else {
    console.log('🌐 Using CDN MediaPipe models (online mode)');
    
    // CDN fallback options
    const cdnOptions = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629',
      'https://cdn.jsdelivr.net/npm/@mediapipe/holistic',
      'https://unpkg.com/@mediapipe/holistic@0.5.1675471629',
      'https://unpkg.com/@mediapipe/holistic'
    ];
    
    // Try to find a working CDN
    for (const cdnUrl of cdnOptions) {
      try {
        const testUrl = `${cdnUrl}/holistic.binarypb`;
        const response = await fetch(testUrl, { method: 'HEAD', cache: 'no-cache' });
        if (response.ok) {
          console.log(`✅ Using CDN: ${cdnUrl}`);
          return (file: string) => `${cdnUrl}/${file}`;
        }
      } catch (error) {
        console.log(`❌ CDN failed: ${cdnUrl}`);
        continue;
      }
    }
    
    // Fallback to the primary CDN even if the test failed
    console.log('⚠️ Using fallback CDN (may not work offline)');
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