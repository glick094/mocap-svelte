/**
 * Smoothing Service
 * Handles Savitzky-Golay smoothing and other data processing algorithms
 */

/**
 * Savitzky-Golay filter implementation
 * Smooths pose landmark data to reduce noise
 */
export function savitzkyGolayFilter(data, windowSize = 5, polynomialOrder = 3) {
  if (!data || data.length < windowSize) {
    return data;
  }

  const halfWindow = Math.floor(windowSize / 2);
  const smoothedData = [];

  // Generate Savitzky-Golay coefficients
  const coefficients = generateSavGolCoefficients(windowSize, polynomialOrder);

  for (let i = 0; i < data.length; i++) {
    let smoothedValue = 0;
    let weightSum = 0;

    for (let j = -halfWindow; j <= halfWindow; j++) {
      const index = i + j;
      if (index >= 0 && index < data.length) {
        const weight = coefficients[j + halfWindow];
        smoothedValue += data[index] * weight;
        weightSum += weight;
      }
    }

    smoothedData.push(weightSum > 0 ? smoothedValue / weightSum : data[i]);
  }

  return smoothedData;
}

/**
 * Generate Savitzky-Golay coefficients
 */
function generateSavGolCoefficients(windowSize, polynomialOrder) {
  const halfWindow = Math.floor(windowSize / 2);
  const coefficients = new Array(windowSize);

  // Simplified coefficient generation for common cases
  if (windowSize === 5 && polynomialOrder === 2) {
    // Pre-computed coefficients for 5-point quadratic
    return [-3, 12, 17, 12, -3].map(c => c / 35);
  } else if (windowSize === 7 && polynomialOrder === 2) {
    // Pre-computed coefficients for 7-point quadratic
    return [-2, 3, 6, 7, 6, 3, -2].map(c => c / 21);
  } else {
    // Fallback to simple moving average
    return new Array(windowSize).fill(1 / windowSize);
  }
}

/**
 * Smooth pose landmarks using Savitzky-Golay filter
 */
export function smoothLandmarks(landmarks, history = [], windowSize = 5, polynomialOrder = 2) {
  if (!landmarks || landmarks.length === 0) {
    return landmarks;
  }

  // Add current landmarks to history
  history.push(landmarks);
  
  // Keep only the last `windowSize` frames
  if (history.length > windowSize) {
    history.shift();
  }

  // If we don't have enough history, return original landmarks
  if (history.length < windowSize) {
    return landmarks;
  }

  const smoothedLandmarks = [];

  // Smooth each landmark coordinate
  for (let i = 0; i < landmarks.length; i++) {
    const xValues = history.map(frame => frame[i]?.x || 0);
    const yValues = history.map(frame => frame[i]?.y || 0);
    const zValues = history.map(frame => frame[i]?.z || 0);

    const smoothedX = savitzkyGolayFilter(xValues, windowSize, polynomialOrder);
    const smoothedY = savitzkyGolayFilter(yValues, windowSize, polynomialOrder);
    const smoothedZ = savitzkyGolayFilter(zValues, windowSize, polynomialOrder);

    smoothedLandmarks.push({
      x: smoothedX[smoothedX.length - 1],
      y: smoothedY[smoothedY.length - 1],
      z: smoothedZ[smoothedZ.length - 1],
      visibility: landmarks[i]?.visibility
    });
  }

  return smoothedLandmarks;
}

/**
 * Simple exponential moving average for real-time smoothing
 */
export function exponentialMovingAverage(newValue, previousValue, alpha = 0.3) {
  if (previousValue === null || previousValue === undefined) {
    return newValue;
  }
  return alpha * newValue + (1 - alpha) * previousValue;
}

/**
 * Apply exponential smoothing to landmarks
 */
export function applySmoothingToLandmarks(newLandmarks, previousLandmarks, alpha = 0.3) {
  if (!newLandmarks || !previousLandmarks) {
    return newLandmarks;
  }

  return newLandmarks.map((landmark, index) => {
    const prevLandmark = previousLandmarks[index];
    if (!prevLandmark) return landmark;

    return {
      x: exponentialMovingAverage(landmark.x, prevLandmark.x, alpha),
      y: exponentialMovingAverage(landmark.y, prevLandmark.y, alpha),
      z: exponentialMovingAverage(landmark.z, prevLandmark.z, alpha),
      visibility: landmark.visibility
    };
  });
}