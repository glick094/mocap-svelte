/**
 * Theme Usage Examples
 * Shows how to use the new theming system
 */

import { 
  setUITheme, 
  setGameTheme, 
  updateGameColors, 
  updatePoseColors, 
  updateHipSwaySettings 
} from '../themeStore';

// Example: Switch to light theme
export function switchToLightTheme() {
  setUITheme('light');
}

// Example: Switch to vibrant game theme
export function switchToVibrantGameTheme() {
  setGameTheme('vibrant');
}

// Example: Customize hip sway colors
export function customizeHipSwayColors() {
  updateGameColors({
    hipLeft: '#e67e22',  // Orange
    hipRight: '#e67e22'  // Orange
  });
}

// Example: Make hip sway regions more transparent
export function makeHipSwayTransparent() {
  updateHipSwaySettings({
    fillOpacity: 0.3,
    outlineOpacity: 0.5
  });
}

// Example: Change pose visualization colors
export function customizePoseColors() {
  updatePoseColors({
    head: '#9b59b6',     // Purple
    arms: '#e74c3c',     // Red
    legs: '#3498db',     // Blue
    hands: '#e74c3c',    // Red
    face: '#9b59b6',     // Purple
    torso: '#95a5a6'     // Gray
  });
}

// Example: Create a "neon" theme
export function createNeonTheme() {
  updateGameColors({
    hand: '#ff073a',     // Neon red
    head: '#39ff14',     // Neon green
    knee: '#ff6600',     // Neon orange
    hipLeft: '#ffff00',  // Neon yellow
    hipRight: '#ffff00'  // Neon yellow
  });
  
  updatePoseColors({
    head: '#39ff14',     // Neon green
    arms: '#ff073a',     // Neon red
    legs: '#0080ff',     // Neon blue
    hands: '#ff073a',    // Neon red
    face: '#39ff14',     // Neon green
    torso: '#ffffff'     // White
  });
  
  updateHipSwaySettings({
    fillOpacity: 0.8,
    outlineOpacity: 1.0,
    outlineColor: '#ffffff',
    outlineWidth: 3
  });
}