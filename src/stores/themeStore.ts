/**
 * Theme Store
 * Manages application theming including UI colors, pose visualization colors, and game colors
 */
import { writable, derived } from 'svelte/store';

// Theme types
export interface PoseColors {
  head: string;
  arms: string;
  legs: string;
  hands: string;
  leftHand: string;
  rightHand: string;
  face: string;
  torso: string;
}

export interface UITheme {
  name: string;
  colors: {
    // Background colors
    background: string;
    surface: string;
    surfaceVariant: string;
    
    // Text colors
    onBackground: string;
    onSurface: string;
    onSurfaceVariant: string;
    
    // Primary colors
    primary: string;
    onPrimary: string;
    primaryContainer: string;
    onPrimaryContainer: string;
    
    // Secondary colors
    secondary: string;
    onSecondary: string;
    secondaryContainer: string;
    onSecondaryContainer: string;
    
    // Error colors
    error: string;
    onError: string;
    errorContainer: string;
    onErrorContainer: string;
    
    // Success colors
    success: string;
    onSuccess: string;
    
    // Warning colors
    warning: string;
    onWarning: string;
    
    // Border and outline
    outline: string;
    outlineVariant: string;
  };
}

export interface GameTheme {
  name: string;
  targetColors: {
    hand: string;
    head: string;
    knee: string;
    hipLeft: string;
    hipRight: string;
  };
  hipSwayRegions: {
    fillOpacity: number;
    outlineOpacity: number;
    outlineColor: string;
    outlineWidth: number;
  };
  poses: PoseColors;
}

// Theme definitions
export const lightTheme: UITheme = {
  name: 'light',
  colors: {
    background: '#ffffff',
    surface: '#f8f9fa',
    surfaceVariant: '#e9ecef',
    
    onBackground: '#212529',
    onSurface: '#343a40',
    onSurfaceVariant: '#495057',
    
    primary: '#0d6efd',
    onPrimary: '#ffffff',
    primaryContainer: '#cfe2ff',
    onPrimaryContainer: '#041e42',
    
    secondary: '#6c757d',
    onSecondary: '#ffffff',
    secondaryContainer: '#e2e3e5',
    onSecondaryContainer: '#1c1d1e',
    
    error: '#dc3545',
    onError: '#ffffff',
    errorContainer: '#f8d7da',
    onErrorContainer: '#58151c',
    
    success: '#198754',
    onSuccess: '#ffffff',
    
    warning: '#ffc107',
    onWarning: '#000000',
    
    outline: '#dee2e6',
    outlineVariant: '#ced4da'
  }
};

export const darkTheme: UITheme = {
  name: 'dark',
  colors: {
    background: '#121212',
    surface: '#1e1e1e',
    surfaceVariant: '#2d2d2d',
    
    onBackground: '#ffffff',
    onSurface: '#e0e0e0',
    onSurfaceVariant: '#c0c0c0',
    
    primary: '#4fc3f7',
    onPrimary: '#003258',
    primaryContainer: '#004881',
    onPrimaryContainer: '#cfe9ff',
    
    secondary: '#b0bec5',
    onSecondary: '#1c1c1c',
    secondaryContainer: '#37474f',
    onSecondaryContainer: '#cfd8dc',
    
    error: '#f48fb1',
    onError: '#5f1119',
    errorContainer: '#8c1d18',
    onErrorContainer: '#ffdad6',
    
    success: '#81c784',
    onSuccess: '#003912',
    
    warning: '#ffb74d',
    onWarning: '#3e2723',
    
    outline: '#495057',
    outlineVariant: '#6c757d'
  }
};

// Colorblind-accessible theme using Paul Tol's palette
export const colorblindAccessibleTheme: GameTheme = {
  name: 'colorblind-accessible',
  targetColors: {
    // Left hand uses orange for hand tracking
    hand: '#E69F00',      // Orange - for hand targets and left hand landmarks
    // Head uses sky blue for head/face tracking  
    // head: '#56B4E9',      // Sky blue - for head targets and face landmarks
    head: '#44AA99',      // Light green - for head targets and face landmarks
    // Knees use blue for knee tracking
    knee: '#0173B2',      // Blue - for knee targets and leg landmarks
    // Hips use orange and reddish purple for left/right distinction
    hipLeft: '#E69F00',   // Orange - for left hip region (matches hand color)
    hipRight: '#CC79A7'   // Reddish purple - for right hip region
  },
  hipSwayRegions: {
    fillOpacity: 0.6,
    outlineOpacity: 0.8,
    outlineColor: '#ffffff',
    outlineWidth: 2
  },
  poses: {
    // Match tracking colors to target colors for visual consistency
    // head: '#56B4E9',      // Sky blue - matches head targets
    head: '#44AA99',      // Light green - matches head targets
    arms: '#CC79A7',      // Reddish purple - for arm structure
    legs: '#0173B2',      // Blue - matches knee targets
    hands: '#E69F00',     // Orange - default hand color
    leftHand: '#E69F00',  // Orange - matches hand targets (left hand)
    rightHand: '#CC79A7', // Reddish purple - distinguishable from left
    // face: '#56B4E9',      // Sky blue - matches head targets
    face: '#44AA99',      // Light Green - matches head targets
    torso: '#999999'      // Gray - neutral for torso/body structure
  }
};

export const defaultGameTheme: GameTheme = {
  name: 'default',
  targetColors: {
    hand: '#ff6b6b',
    head: '#4ecdc4', 
    knee: '#45b7d1',
    hipLeft: '#f1b603',
    hipRight: '#f39c12'
  },
  hipSwayRegions: {
    fillOpacity: 0.6,
    outlineOpacity: 0.8,
    outlineColor: '#ffffff',
    outlineWidth: 2
  },
  poses: {
    head: '#4ecdc4',    // Teal for head/face
    arms: '#ff6b6b',    // Red for arms/hands  
    legs: '#45b7d1',    // Blue for legs
    hands: '#ff6b6b',   // Red for hands (matches arms)
    leftHand: '#ff6b6b', // Red for left hand
    rightHand: '#45b7d1', // Blue for right hand
    face: '#4ecdc4',    // Teal for face (matches head)
    torso: '#95a5a6'    // Gray for torso/body
  }
};

export const vibrantGameTheme: GameTheme = {
  name: 'vibrant',
  targetColors: {
    hand: '#e74c3c',
    head: '#2ecc71', 
    knee: '#3498db',
    hipLeft: '#f1c40f',
    hipRight: '#f1c40f'
  },
  hipSwayRegions: {
    fillOpacity: 0.7,
    outlineOpacity: 0.9,
    outlineColor: '#ecf0f1',
    outlineWidth: 3
  },
  poses: {
    head: '#2ecc71',    // Green
    arms: '#e74c3c',    // Red
    legs: '#3498db',    // Blue
    hands: '#e74c3c',   // Red
    leftHand: '#e74c3c', // Red for left hand
    rightHand: '#3498db', // Blue for right hand
    face: '#2ecc71',    // Green
    torso: '#95a5a6'    // Gray
  }
};

export const pastelGameTheme: GameTheme = {
  name: 'pastel',
  targetColors: {
    hand: '#ff9ff3',
    head: '#70d0e4', 
    knee: '#a8e6cf',
    hipLeft: '#ffd93d',
    hipRight: '#ffd93d'
  },
  hipSwayRegions: {
    fillOpacity: 0.4,
    outlineOpacity: 0.6,
    outlineColor: '#ffffff',
    outlineWidth: 2
  },
  poses: {
    head: '#70d0e4',    // Light blue
    arms: '#ff9ff3',    // Light pink
    legs: '#a8e6cf',    // Light green
    hands: '#ff9ff3',   // Light pink
    leftHand: '#ff9ff3', // Light pink for left hand
    rightHand: '#a8e6cf', // Light green for right hand
    face: '#70d0e4',    // Light blue
    torso: '#d1d5db'    // Light gray
  }
};

// Available themes
export const uiThemes = [lightTheme, darkTheme];
export const gameThemes = [colorblindAccessibleTheme, defaultGameTheme, vibrantGameTheme, pastelGameTheme];

// Current theme stores
export const currentUITheme = writable<UITheme>(darkTheme);
export const currentGameTheme = writable<GameTheme>(colorblindAccessibleTheme);

// Derived stores for easy access
export const uiColors = derived(currentUITheme, $theme => $theme.colors);
export const gameColors = derived(currentGameTheme, $theme => $theme.targetColors);
export const poseColors = derived(currentGameTheme, $theme => $theme.poses);
export const hipSwaySettings = derived(currentGameTheme, $theme => $theme.hipSwayRegions);

// Theme actions
export function setUITheme(themeName: string) {
  const theme = uiThemes.find(t => t.name === themeName);
  if (theme) {
    currentUITheme.set(theme);
  }
}

export function setGameTheme(themeName: string) {
  const theme = gameThemes.find(t => t.name === themeName);
  if (theme) {
    currentGameTheme.set(theme);
  }
}

export function updateGameColors(colors: Partial<GameTheme['targetColors']>) {
  currentGameTheme.update(theme => ({
    ...theme,
    targetColors: { ...theme.targetColors, ...colors }
  }));
}

export function updatePoseColors(colors: Partial<PoseColors>) {
  currentGameTheme.update(theme => ({
    ...theme,
    poses: { ...theme.poses, ...colors }
  }));
}

export function updateHipSwaySettings(settings: Partial<GameTheme['hipSwayRegions']>) {
  currentGameTheme.update(theme => ({
    ...theme,
    hipSwayRegions: { ...theme.hipSwayRegions, ...settings }
  }));
}