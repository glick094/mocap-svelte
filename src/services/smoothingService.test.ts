/**
 * Unit tests for Smoothing Service
 */
import { describe, it, expect } from 'vitest';
import {
  savitzkyGolayFilter,
  smoothLandmarks,
  exponentialMovingAverage,
  applySmoothingToLandmarks
} from './smoothingService.js';
import type { Landmark } from './mediaPipeService.js';

describe('smoothingService', () => {
  describe('savitzkyGolayFilter', () => {
    it('should return original data when data length is less than window size', () => {
      const data = [1, 2, 3];
      const result = savitzkyGolayFilter(data, 5, 3);
      expect(result).toEqual(data);
    });

    it('should return original data when no data provided', () => {
      const result = savitzkyGolayFilter(null as any, 5, 3);
      expect(result).toBeNull();
    });

    it('should smooth data with 5-point quadratic filter', () => {
      const data = [1, 3, 2, 4, 3, 5, 4];
      const result = savitzkyGolayFilter(data, 5, 2);
      
      // Should return same length
      expect(result).toHaveLength(data.length);
      
      // Values should be numbers
      result.forEach(val => expect(typeof val).toBe('number'));
      
      // First and last values should be influenced by edge handling
      expect(result[0]).toBeCloseTo(1, 1);
      expect(result[result.length - 1]).toBeCloseTo(4, 1);
    });

    it('should smooth data with 7-point quadratic filter', () => {
      const data = [1, 3, 2, 4, 3, 5, 4, 6, 5];
      const result = savitzkyGolayFilter(data, 7, 2);
      
      expect(result).toHaveLength(data.length);
      result.forEach(val => expect(typeof val).toBe('number'));
    });

    it('should fall back to moving average for unsupported configurations', () => {
      const data = [1, 2, 3, 4, 5];
      const result = savitzkyGolayFilter(data, 3, 4); // Unsupported config
      
      expect(result).toHaveLength(data.length);
      
      // Should be simple moving average
      const expected = data.map((_, i) => {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - 1); j <= Math.min(data.length - 1, i + 1); j++) {
          sum += data[j];
          count++;
        }
        return sum / count;
      });
      
      result.forEach((val, i) => {
        expect(val).toBeCloseTo(expected[i], 5);
      });
    });

    it('should handle noisy data appropriately', () => {
      // Noisy sine wave
      const data = Array.from({ length: 20 }, (_, i) => 
        Math.sin(i * 0.1) + (Math.random() - 0.5) * 0.1
      );
      
      const result = savitzkyGolayFilter(data, 5, 2);
      expect(result).toHaveLength(data.length);
      
      // Smoothed data should have less variance than original
      const originalVariance = calculateVariance(data);
      const smoothedVariance = calculateVariance(result);
      expect(smoothedVariance).toBeLessThanOrEqual(originalVariance);
    });
  });

  describe('smoothLandmarks', () => {
    const createMockLandmarks = (count: number, baseValue: number = 0.5): Landmark[] => {
      return Array.from({ length: count }, (_, i) => ({
        x: baseValue + i * 0.01,
        y: baseValue + i * 0.01,
        z: baseValue + i * 0.01,
        visibility: 0.9
      }));
    };

    it('should return original landmarks when no landmarks provided', () => {
      const result = smoothLandmarks(null as any);
      expect(result).toBeNull();
    });

    it('should return original landmarks when empty array', () => {
      const result = smoothLandmarks([]);
      expect(result).toEqual([]);
    });

    it('should return original landmarks when insufficient history', () => {
      const landmarks = createMockLandmarks(3);
      const history: Landmark[][] = [];
      
      const result = smoothLandmarks(landmarks, history, 5, 2);
      expect(result).toEqual(landmarks);
      expect(history).toHaveLength(1);
    });

    it('should smooth landmarks when sufficient history is available', () => {
      const landmarks1 = createMockLandmarks(2, 0.5);
      const landmarks2 = createMockLandmarks(2, 0.6);
      const landmarks3 = createMockLandmarks(2, 0.7);
      const landmarks4 = createMockLandmarks(2, 0.8);
      const landmarks5 = createMockLandmarks(2, 0.9);

      const history: Landmark[][] = [];
      
      // Build up history
      smoothLandmarks(landmarks1, history, 5, 2);
      smoothLandmarks(landmarks2, history, 5, 2);
      smoothLandmarks(landmarks3, history, 5, 2);
      smoothLandmarks(landmarks4, history, 5, 2);
      const result = smoothLandmarks(landmarks5, history, 5, 2);

      expect(result).toHaveLength(2);
      
      // Smoothed values should be between the extremes
      expect(result[0].x).toBeGreaterThan(0.5);
      expect(result[0].x).toBeLessThan(0.9);
      expect(result[0].y).toBeGreaterThan(0.5);
      expect(result[0].y).toBeLessThan(0.9);
    });

    it('should maintain history window size', () => {
      const landmarks = createMockLandmarks(1);
      const history: Landmark[][] = [];
      const windowSize = 3;

      // Add more frames than window size
      for (let i = 0; i < 5; i++) {
        smoothLandmarks(landmarks, history, windowSize, 2);
      }

      expect(history).toHaveLength(windowSize);
    });

    it('should preserve visibility values', () => {
      const landmarks = createMockLandmarks(2);
      landmarks[0].visibility = 0.7;
      landmarks[1].visibility = 0.8;

      const history: Landmark[][] = [];
      
      // Fill history
      for (let i = 0; i < 5; i++) {
        smoothLandmarks(landmarks, history, 5, 2);
      }

      const result = smoothLandmarks(landmarks, history, 5, 2);
      expect(result[0].visibility).toBe(0.7);
      expect(result[1].visibility).toBe(0.8);
    });

    it('should handle missing landmarks in history', () => {
      const landmarks = createMockLandmarks(3);
      const partialLandmarks = createMockLandmarks(2); // Missing one landmark
      
      const history: Landmark[][] = [];
      
      // Add frames with different landmark counts
      smoothLandmarks(landmarks, history, 5, 2);
      smoothLandmarks(partialLandmarks, history, 5, 2);
      smoothLandmarks(landmarks, history, 5, 2);
      smoothLandmarks(landmarks, history, 5, 2);
      const result = smoothLandmarks(landmarks, history, 5, 2);

      expect(result).toHaveLength(3);
      expect(result[2]).toBeDefined();
    });
  });

  describe('exponentialMovingAverage', () => {
    it('should return new value when no previous value', () => {
      const result = exponentialMovingAverage(10, null, 0.3);
      expect(result).toBe(10);
    });

    it('should return new value when previous value is undefined', () => {
      const result = exponentialMovingAverage(10, undefined, 0.3);
      expect(result).toBe(10);
    });

    it('should calculate weighted average correctly', () => {
      const newValue = 10;
      const previousValue = 5;
      const alpha = 0.3;
      
      const result = exponentialMovingAverage(newValue, previousValue, alpha);
      const expected = alpha * newValue + (1 - alpha) * previousValue;
      
      expect(result).toBeCloseTo(expected, 10);
      expect(result).toBeCloseTo(6.5, 1);
    });

    it('should work with alpha = 0 (no change)', () => {
      const result = exponentialMovingAverage(10, 5, 0);
      expect(result).toBe(5);
    });

    it('should work with alpha = 1 (complete replacement)', () => {
      const result = exponentialMovingAverage(10, 5, 1);
      expect(result).toBe(10);
    });

    it('should handle default alpha value', () => {
      const result = exponentialMovingAverage(10, 5);
      const expected = 0.3 * 10 + 0.7 * 5;
      expect(result).toBeCloseTo(expected, 10);
    });
  });

  describe('applySmoothingToLandmarks', () => {
    const createTestLandmark = (x: number, y: number, z: number): Landmark => ({
      x, y, z, visibility: 0.9
    });

    it('should return new landmarks when no previous landmarks', () => {
      const newLandmarks = [createTestLandmark(1, 2, 3)];
      const result = applySmoothingToLandmarks(newLandmarks, null);
      expect(result).toBe(newLandmarks);
    });

    it('should return new landmarks when previous landmarks undefined', () => {
      const newLandmarks = [createTestLandmark(1, 2, 3)];
      const result = applySmoothingToLandmarks(newLandmarks, undefined);
      expect(result).toBe(newLandmarks);
    });

    it('should apply smoothing to matching landmarks', () => {
      const newLandmarks = [createTestLandmark(10, 10, 10)];
      const previousLandmarks = [createTestLandmark(0, 0, 0)];
      const alpha = 0.5;

      const result = applySmoothingToLandmarks(newLandmarks, previousLandmarks, alpha);

      expect(result).toHaveLength(1);
      expect(result[0].x).toBeCloseTo(5, 10); // 0.5 * 10 + 0.5 * 0
      expect(result[0].y).toBeCloseTo(5, 10);
      expect(result[0].z).toBeCloseTo(5, 10);
      expect(result[0].visibility).toBe(0.9);
    });

    it('should handle mismatched landmark array lengths', () => {
      const newLandmarks = [
        createTestLandmark(10, 10, 10),
        createTestLandmark(20, 20, 20)
      ];
      const previousLandmarks = [createTestLandmark(0, 0, 0)]; // Only one landmark

      const result = applySmoothingToLandmarks(newLandmarks, previousLandmarks, 0.5);

      expect(result).toHaveLength(2);
      expect(result[0].x).toBeCloseTo(5, 10); // Smoothed
      expect(result[1].x).toBe(20); // Not smoothed (no previous match)
    });

    it('should use default alpha when not provided', () => {
      const newLandmarks = [createTestLandmark(10, 10, 10)];
      const previousLandmarks = [createTestLandmark(0, 0, 0)];

      const result = applySmoothingToLandmarks(newLandmarks, previousLandmarks);

      // Default alpha is 0.3
      const expectedX = 0.3 * 10 + 0.7 * 0;
      expect(result[0].x).toBeCloseTo(expectedX, 10);
    });

    it('should preserve visibility from new landmarks', () => {
      const newLandmarks = [{ x: 10, y: 10, z: 10, visibility: 0.8 }];
      const previousLandmarks = [{ x: 0, y: 0, z: 0, visibility: 0.5 }];

      const result = applySmoothingToLandmarks(newLandmarks, previousLandmarks);

      expect(result[0].visibility).toBe(0.8);
    });
  });
});

// Helper function to calculate variance
function calculateVariance(data: number[]): number {
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const squaredDiffs = data.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / data.length;
}