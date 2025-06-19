/**
 * Game Service
 * Handles game logic, state management, and collision detection for motion capture games
 */

import { get } from 'svelte/store';
import { gameSettings } from '../stores/gameStore.js';

// Game mode constants
export const GAME_MODES = {
  HIPS_SWAY: 'hips-sway',
  HANDS_FIXED: 'hands-fixed',
  HEAD_FIXED: 'head-fixed',
  RANDOM: 'random'
} as const;

export type GameMode = typeof GAME_MODES[keyof typeof GAME_MODES];

// Target type constants
export const TARGET_TYPES = {
  HAND: 'hand',
  HEAD: 'head', 
  KNEE: 'knee',
  HIP_LEFT: 'hip-left',
  HIP_RIGHT: 'hip-right'
} as const;

export type TargetType = typeof TARGET_TYPES[keyof typeof TARGET_TYPES];

// Target colors
export const TARGET_COLORS = {
  [TARGET_TYPES.HAND]: '#ff0000', // Red for hands
  [TARGET_TYPES.HEAD]: '#00ff88', // Green for head
  [TARGET_TYPES.KNEE]: '#0000ff',  // Blue for knees
  [TARGET_TYPES.HIP_LEFT]: '#ffff00', // Yellow for left hip region
  [TARGET_TYPES.HIP_RIGHT]: '#ffff00' // Yellow for right hip region
} as const;

// Type definitions
export interface Target {
  id: string | number;
  type: TargetType;
  x: number;
  y: number;
  color: string;
}

export interface TargetExplosion {
  id: string | number;
  x: number;
  y: number;
  color: string;
  startTime: number;
  duration: number;
  particles: ExplosionParticle[];
}

export interface ExplosionParticle {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface HipRegions {
  leftRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rightRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  centerLine: {
    x: number;
    y: number;
    height: number;
  };
}

export interface HipSwayState {
  phase: 'centering' | 'targeting' | 'completed';
  currentTrial: number;
  targetSide: 'left' | 'right' | null;
  leftSideHits: number;
  rightSideHits: number;
  isCentered: boolean;
  centeringStartTime: number | null;
  inTargetRegion: boolean;
  trialCompleted: boolean;
  animation: {
    isAnimating: boolean;
    animationStartTime: number | null;
    velocityX: number;
    velocityY: number;
    animationDuration: number; // ms
  };
  lastHipPosition: {
    x: number;
    y: number;
    timestamp: number;
  } | null;
}

export interface HandsCenteringState {
  phase: 'centering' | 'targeting' | 'completed';
  isCentered: boolean;
  centeringStartTime: number | null;
  centeringTolerance: number;
  centeringTimeRequired: number;
  leftCenterX: number;
  leftCenterY: number;
  rightCenterX: number;
  rightCenterY: number;
}

export interface HeadCenteringState {
  phase: 'centering' | 'targeting' | 'completed';
  isCentered: boolean;
  centeringStartTime: number | null;
  centeringTolerance: number;
  centeringTimeRequired: number;
  centerX: number;
  centerY: number;
}

export interface TargetData {
  targetShowing: boolean;
  targetId: string | number | null;
  targetType: TargetType | null;
  targetX: number | null; // Normalized 0-1
  targetY: number | null; // Normalized 0-1
  targetPixelX: number | null; // Absolute pixel coordinates
  targetPixelY: number | null; // Absolute pixel coordinates
  status: 'start' | 'unobtained' | 'obtained' | 'end' | null;
  startTime: number | null;
  hitTime: number | null;
  hitKeypoint?: string | null;
  gameMode: GameMode;
  gamePhase: string;
  targetIndex?: number | null; // For fixed target games
  trialNumber?: number | null; // For hip sway trials
}

export interface GameState {
  gameScore: number;
  targetRadius: number;
  hitTargetIds: Set<string | number>;
  scoreBreakdown: {
    hand: number;
    head: number;
    knee: number;
  };
  targetHistory: TargetData[];
  currentTargetData: TargetData | null;
  hipSwayState: HipSwayState;
  handsCenteringState: HandsCenteringState;
  headCenteringState: HeadCenteringState;
  fixedTargets: Target[];
  currentFixedTargetIndex: number;
  currentTarget: Target | null;
  activeExplosions: TargetExplosion[];
}

export interface PoseData {
  poseLandmarks?: any[];
  leftHandLandmarks?: any[];
  rightHandLandmarks?: any[];
  faceLandmarks?: any[];
  timestamp?: number;
}

/**
 * Game Service Class
 */
export class GameService {
  private state: GameState;
  private width: number;
  private height: number;
  private gameMode: GameMode;
  private randomTargetCounter: number = 1; // Counter for random targets

  // Helper function for zero-padded trial numbers
  private formatTrialNumber(num: number): string {
    return num.toString().padStart(3, '0');
  }

  constructor(width: number, height: number, gameMode: GameMode = GAME_MODES.RANDOM) {
    this.width = width;
    this.height = height;
    this.gameMode = gameMode;
    this.state = this.initializeGameState();
  }

  private initializeGameState(): GameState {
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const radiusX = this.width * 0.4;
    
    return {
      gameScore: 0,
      targetRadius: 50,
      hitTargetIds: new Set(),
      scoreBreakdown: {
        hand: 0,
        head: 0,
        knee: 0
      },
      targetHistory: [],
      currentTargetData: null,
      hipSwayState: {
        phase: 'centering',
        currentTrial: 0,
        targetSide: null,
        leftSideHits: 0,
        rightSideHits: 0,
        isCentered: false,
        centeringStartTime: null,
        inTargetRegion: false,
        trialCompleted: false,
        animation: {
          isAnimating: false,
          animationStartTime: null,
          velocityX: 0,
          velocityY: 0,
          animationDuration: 800 // 800ms animation
        },
        lastHipPosition: null
      },
      handsCenteringState: {
        phase: 'centering',
        isCentered: false,
        centeringStartTime: null,
        centeringTolerance: 80, // 80px radius from center points (more generous)
        centeringTimeRequired: 1000, // 1 second for easier testing
        leftCenterX: centerX - radiusX * 0.5, // Halfway between center and left extreme
        leftCenterY: centerY, // Same Y as figure-8 center
        rightCenterX: centerX + radiusX * 0.5, // Halfway between center and right extreme
        rightCenterY: centerY // Same Y as figure-8 center
      },
      headCenteringState: {
        phase: 'centering',
        isCentered: false,
        centeringStartTime: null,
        centeringTolerance: 80, // 80px radius from center point (more generous)
        centeringTimeRequired: 1000, // 1 second for easier testing
        centerX: centerX,
        centerY: this.height * 0.3 // Match the actual circle center Y
      },
      fixedTargets: [],
      currentFixedTargetIndex: 0,
      currentTarget: null,
      activeExplosions: []
    };
  }

  // Getters
  public getGameScore(): number {
    return this.state.gameScore;
  }

  public getCurrentTarget(): Target | null {
    return this.state.currentTarget;
  }

  public getScoreBreakdown() {
    return { ...this.state.scoreBreakdown };
  }

  public getHipSwayState(): HipSwayState {
    return { ...this.state.hipSwayState };
  }

  public getHandsCenteringState(): HandsCenteringState {
    return { ...this.state.handsCenteringState };
  }

  public getHeadCenteringState(): HeadCenteringState {
    return { ...this.state.headCenteringState };
  }

  public getHipSwayAnimationOffset(): { offsetX: number; offsetY: number; opacity: number } | null {
    const hipSwayState = this.state.hipSwayState;
    
    if (!hipSwayState.animation.isAnimating || !hipSwayState.animation.animationStartTime) {
      return null;
    }
    
    const currentTime = Date.now();
    const elapsed = currentTime - hipSwayState.animation.animationStartTime;
    const progress = Math.min(elapsed / hipSwayState.animation.animationDuration, 1);
    
    // Apply easing function (ease-out cubic)
    const easeOut = 1 - Math.pow(1 - progress, 3);
    
    // Calculate offset based on velocity and easing
    const offsetX = hipSwayState.animation.velocityX * elapsed / 1000 * easeOut;
    const offsetY = hipSwayState.animation.velocityY * elapsed / 1000 * easeOut;
    
    // Fade out as animation progresses
    const opacity = 1 - easeOut;
    
    return {
      offsetX,
      offsetY,
      opacity: Math.max(0, opacity)
    };
  }

  public getFixedTargets(): Target[] {
    return [...this.state.fixedTargets];
  }

  public getCurrentFixedTargetIndex(): number {
    return this.state.currentFixedTargetIndex;
  }

  public getTargetHistory(): any[] {
    return [...this.state.targetHistory];
  }

  public getActiveExplosions(): TargetExplosion[] {
    return [...this.state.activeExplosions];
  }

  // Target generation functions
  public generateFigure8Targets(): Target[] {
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const radiusX = this.width * 0.4;
    const radiusY = this.height * 0.3;
    
    const targets: Target[] = [];
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * 2 * Math.PI;
      const x = centerX + radiusX * Math.sin(t);
      const y = centerY + radiusY * Math.sin(2 * t);
      
      targets.push({
        id: `figure8_${this.formatTrialNumber(i + 1)}`, // 1-based with zero padding
        type: TARGET_TYPES.HAND,
        x: x,
        y: y,
        color: TARGET_COLORS[TARGET_TYPES.HAND]
      });
    }
    return targets;
  }
  
  public generateCircleTargets(): Target[] {
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.3;
    const radius = Math.min(this.width, this.height) * 0.20;
    
    const targets: Target[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      targets.push({
        id: `circle_${this.formatTrialNumber(i + 1)}`, // 1-based with zero padding
        type: TARGET_TYPES.HEAD,
        x: x,
        y: y,
        color: TARGET_COLORS[TARGET_TYPES.HEAD]
      });
    }
    return targets;
  }
  
  public generateHipSwayRegions(): HipRegions {
    const regionWidth = this.width * 0.35;
    const regionHeight = this.height;
    const regionY = this.height * 0.2;
    
    return {
      leftRegion: {
        x: 0,
        y: regionY,
        width: regionWidth,
        height: regionHeight
      },
      rightRegion: {
        x: this.width - regionWidth,
        y: regionY,
        width: regionWidth,
        height: regionHeight
      },
      centerLine: {
        x: this.width / 2,
        y: regionY,
        height: regionHeight
      }
    };
  }

  public generateRandomTarget(): Target {
    const types = [TARGET_TYPES.HAND, TARGET_TYPES.HEAD, TARGET_TYPES.KNEE];
    const targetType = types[Math.floor(Math.random() * types.length)];
    
    const borderX = this.width * 0.05;
    const borderY = this.height * 0.05;
    const usableWidth = this.width * 0.9;
    const usableHeight = this.height * 0.9;
    
    let x: number, y: number;
    
    switch(targetType) {
      case TARGET_TYPES.HEAD:
        const headBorderY = this.height * 0.1;
        const headUsableHeight = this.height * 0.8;
        x = Math.random() * usableWidth + borderX;
        y = Math.random() * (headUsableHeight / 3) + headBorderY;
        break;
      case TARGET_TYPES.KNEE:
        x = Math.random() * usableWidth + borderX;
        y = Math.random() * (usableHeight / 4) + (borderY + 3 * usableHeight / 5);
        break;
      case TARGET_TYPES.HAND:
      default:
        x = Math.random() * usableWidth + borderX;
        y = Math.random() * usableHeight + borderY;
        break;
    }

    const targetId = `random_${targetType}_${this.formatTrialNumber(this.randomTargetCounter)}`;
    this.randomTargetCounter++;

    return {
      id: targetId,
      type: targetType,
      x: x,
      y: y,
      color: TARGET_COLORS[targetType]
    };
  }

  // Game initialization
  public startGame(): void {
    this.state.gameScore = 0;
    this.state.hitTargetIds.clear();
    this.state.scoreBreakdown = { hand: 0, head: 0, knee: 0 };
    this.state.targetHistory = [];
    this.state.activeExplosions = [];
    this.randomTargetCounter = 1; // Reset counter for new game
    
    switch (this.gameMode) {
      case GAME_MODES.HIPS_SWAY:
        this.state.hipSwayState = {
          phase: 'centering',
          currentTrial: 1, // Start at trial 1
          targetSide: null,
          leftSideHits: 0,
          rightSideHits: 0,
          isCentered: false,
          centeringStartTime: null,
          inTargetRegion: false,
          trialCompleted: false,
          animation: {
            isAnimating: false,
            animationStartTime: null,
            velocityX: 0,
            velocityY: 0,
            animationDuration: 800
          },
          lastHipPosition: null
        };
        this.state.currentTarget = null;
        
        // Create centering phase data
        this.createHipSwayCenteringData();
        break;
        
      case GAME_MODES.HANDS_FIXED:
        this.state.fixedTargets = this.generateFigure8Targets();
        this.state.currentFixedTargetIndex = 0; // Will be set to 1 after centering
        this.state.currentTarget = null; // No target during centering
        this.state.handsCenteringState.phase = 'centering';
        this.state.handsCenteringState.isCentered = false;
        this.state.handsCenteringState.centeringStartTime = null;
        this.createHandsCenteringData();
        break;
        
      case GAME_MODES.HEAD_FIXED:
        this.state.fixedTargets = this.generateCircleTargets();
        this.state.currentFixedTargetIndex = 0; // Will be set to 1 after centering
        this.state.currentTarget = null; // No target during centering
        this.state.headCenteringState.phase = 'centering';
        this.state.headCenteringState.isCentered = false;
        this.state.headCenteringState.centeringStartTime = null;
        this.createHeadCenteringData();
        break;
        
      case GAME_MODES.RANDOM:
      default:
        this.state.currentTarget = this.generateRandomTarget();
        this.createTargetData();
        break;
    }
  }

  public stopGame(): void {
    if (this.state.currentTargetData) {
      this.state.currentTargetData.status = 'end';
      this.state.targetHistory.push({ ...this.state.currentTargetData });
    }
    
    this.state.currentTarget = null;
    this.state.currentTargetData = null;
  }

  // Collision detection
  public checkCollisions(data: PoseData): { hit: boolean; hitType?: string; modeProgress?: any; playSound?: boolean } {
    if (!data) return { hit: false };
    
    switch (this.gameMode) {
      case GAME_MODES.HIPS_SWAY:
        return this.checkHipSwayCollisions(data);
      case GAME_MODES.HANDS_FIXED:
        return this.checkHandsCenteringCollisions(data);
      case GAME_MODES.HEAD_FIXED:
        return this.checkHeadCenteringCollisions(data);
      case GAME_MODES.RANDOM:
      default:
        return this.checkRandomTargetCollisions(data);
    }
  }

  private checkHipSwayCollisions(data: PoseData): { hit: boolean; hitType?: string; modeProgress?: any; playSound?: boolean } {
    if (!data.poseLandmarks) return { hit: false };
    
    const hipRegions = this.generateHipSwayRegions();
    const leftHip = data.poseLandmarks[23];
    const rightHip = data.poseLandmarks[24];
    
    if (!leftHip || !rightHip) return { hit: false };
    
    const leftHipScreen = {
      x: leftHip.x * this.width,
      y: leftHip.y * this.height
    };
    const rightHipScreen = {
      x: rightHip.x * this.width,
      y: rightHip.y * this.height
    };
    
    // Calculate center point between hips
    const hipCenterX = (leftHipScreen.x + rightHipScreen.x) / 2;
    const hipCenterY = (leftHipScreen.y + rightHipScreen.y) / 2;
    const centerLineX = hipRegions.centerLine.x;
    
    // Calculate hip velocity for animation
    const currentTime = Date.now();
    let velocityX = 0;
    let velocityY = 0;
    
    if (this.state.hipSwayState.lastHipPosition) {
      const deltaTime = currentTime - this.state.hipSwayState.lastHipPosition.timestamp;
      if (deltaTime > 0) {
        velocityX = (hipCenterX - this.state.hipSwayState.lastHipPosition.x) / deltaTime * 1000; // pixels per second
        velocityY = (hipCenterY - this.state.hipSwayState.lastHipPosition.y) / deltaTime * 1000;
      }
    }
    
    // Update last hip position
    this.state.hipSwayState.lastHipPosition = {
      x: hipCenterX,
      y: hipCenterY,
      timestamp: currentTime
    };
    
    // Get settings from gameStore
    const settings = get(gameSettings);
    const centeringTolerance = settings.hipSwayGame.centeringTolerance;
    const centeringTimeRequired = settings.hipSwayGame.centeringTimeRequired;
    const targetsPerSide = settings.hipSwayGame.targetsPerSide;
    
    // Check if hips are centered
    const isCentered = Math.abs(hipCenterX - centerLineX) <= centeringTolerance;
    
    switch (this.state.hipSwayState.phase) {
      case 'centering':
        if (isCentered) {
          if (!this.state.hipSwayState.isCentered) {
            // Just became centered, start timing
            this.state.hipSwayState.isCentered = true;
            this.state.hipSwayState.centeringStartTime = Date.now();
          } else {
            // Check if centered long enough
            const centeringDuration = Date.now() - (this.state.hipSwayState.centeringStartTime || 0);
            if (centeringDuration >= centeringTimeRequired) {
              // Complete centering phase data
              if (this.state.currentTargetData) {
                this.state.currentTargetData.status = 'obtained';
                this.state.currentTargetData.hitTime = Date.now();
                this.state.targetHistory.push({ ...this.state.currentTargetData });
                
                // Create end record for centering phase
                this.state.currentTargetData.status = 'end';
                this.state.targetHistory.push({ ...this.state.currentTargetData });
              }
              
              // Move to targeting phase
              this.state.hipSwayState.phase = 'targeting';
              this.state.hipSwayState.targetSide = 'left'; // Start with left
              this.state.hipSwayState.centeringStartTime = null;
              
              // Create target data for the first hip sway target
              this.createHipSwayTargetData('left');
            }
          }
        } else {
          // Not centered, reset centering timer
          this.state.hipSwayState.isCentered = false;
          this.state.hipSwayState.centeringStartTime = null;
        }
        break;
        
      case 'targeting':
        let inTargetRegion = false;
        
        if (this.state.hipSwayState.targetSide === 'left') {
          inTargetRegion = (
            (leftHipScreen.x >= hipRegions.leftRegion.x && 
             leftHipScreen.x <= hipRegions.leftRegion.x + hipRegions.leftRegion.width &&
             leftHipScreen.y >= hipRegions.leftRegion.y && 
             leftHipScreen.y <= hipRegions.leftRegion.y + hipRegions.leftRegion.height) ||
            (rightHipScreen.x >= hipRegions.leftRegion.x && 
             rightHipScreen.x <= hipRegions.leftRegion.x + hipRegions.leftRegion.width &&
             rightHipScreen.y >= hipRegions.leftRegion.y && 
             rightHipScreen.y <= hipRegions.leftRegion.y + hipRegions.leftRegion.height)
          );
        } else if (this.state.hipSwayState.targetSide === 'right') {
          inTargetRegion = (
            (leftHipScreen.x >= hipRegions.rightRegion.x && 
             leftHipScreen.x <= hipRegions.rightRegion.x + hipRegions.rightRegion.width &&
             leftHipScreen.y >= hipRegions.rightRegion.y && 
             leftHipScreen.y <= hipRegions.rightRegion.y + hipRegions.rightRegion.height) ||
            (rightHipScreen.x >= hipRegions.rightRegion.x && 
             rightHipScreen.x <= hipRegions.rightRegion.x + hipRegions.rightRegion.width &&
             rightHipScreen.y >= hipRegions.rightRegion.y && 
             rightHipScreen.y <= hipRegions.rightRegion.y + hipRegions.rightRegion.height)
          );
        }
        
        if (inTargetRegion && !this.state.hipSwayState.inTargetRegion && !this.state.hipSwayState.trialCompleted) {
          // Hit the target - update target data
          if (this.state.currentTargetData) {
            this.state.currentTargetData.status = 'obtained';
            this.state.currentTargetData.hitTime = Date.now();
            this.state.targetHistory.push({ ...this.state.currentTargetData });
          }
          
          // Hit the target - trigger animation
          this.state.hipSwayState.trialCompleted = true;
          this.state.hipSwayState.currentTrial++;
          this.state.gameScore++;
          
          // Start animation with hip velocity
          this.state.hipSwayState.animation = {
            isAnimating: true,
            animationStartTime: currentTime,
            velocityX: velocityX * 0.8, // Scale velocity for visible animation
            velocityY: velocityY * 0.8,
            animationDuration: 800
          };
          
          // Update side hit counters
          if (this.state.hipSwayState.targetSide === 'left') {
            this.state.hipSwayState.leftSideHits++;
          } else {
            this.state.hipSwayState.rightSideHits++;
          }
          
          // Check if game is complete - either both sides have required hits, or total hits reached
          const totalTargets = targetsPerSide * 2;
          const totalHits = this.state.hipSwayState.leftSideHits + this.state.hipSwayState.rightSideHits;
          const isComplete = (this.state.hipSwayState.leftSideHits >= targetsPerSide && 
                             this.state.hipSwayState.rightSideHits >= targetsPerSide) ||
                             totalHits >= totalTargets;
          
          if (isComplete) {
            this.state.hipSwayState.phase = 'completed';
            this.state.hipSwayState.targetSide = null;
            
            // Create end record for completed target
            if (this.state.currentTargetData) {
              this.state.currentTargetData.status = 'end';
              this.state.targetHistory.push({ ...this.state.currentTargetData });
              this.state.currentTargetData = null;
            }
          } else {
            // Create end record for completed target
            if (this.state.currentTargetData) {
              this.state.currentTargetData.status = 'end';
              this.state.targetHistory.push({ ...this.state.currentTargetData });
            }
            
            // Alternate to the other side after animation completes
            setTimeout(() => {
              // Check if we've reached the maximum for the current side
              const currentSideHits = this.state.hipSwayState.targetSide === 'left' ? 
                this.state.hipSwayState.leftSideHits : this.state.hipSwayState.rightSideHits;
              
              // If current side has reached max targets, switch to other side
              // Otherwise, just alternate normally
              if (currentSideHits >= targetsPerSide) {
                // Switch to the side that has fewer hits
                this.state.hipSwayState.targetSide = this.state.hipSwayState.leftSideHits < this.state.hipSwayState.rightSideHits ? 'left' : 'right';
              } else {
                // Normal alternation: if current side is left, switch to right, and vice versa
                this.state.hipSwayState.targetSide = this.state.hipSwayState.targetSide === 'left' ? 'right' : 'left';
              }
              
              // Create target data for next target
              if (this.state.hipSwayState.targetSide) {
                this.createHipSwayTargetData(this.state.hipSwayState.targetSide);
              }
              
              // Reset animation and trial state
              this.state.hipSwayState.animation.isAnimating = false;
              this.state.hipSwayState.animation.animationStartTime = null;
              this.state.hipSwayState.trialCompleted = false;
            }, this.state.hipSwayState.animation.animationDuration);
          }
          
          this.state.hipSwayState.inTargetRegion = inTargetRegion;
          
          return { 
            hit: true, 
            hitType: `hip-${this.state.hipSwayState.targetSide}`,
            playSound: true, // Flag to trigger sound effect
            modeProgress: { 
              completed: this.state.hipSwayState.leftSideHits + this.state.hipSwayState.rightSideHits, 
              total: totalTargets,
              leftHits: this.state.hipSwayState.leftSideHits,
              rightHits: this.state.hipSwayState.rightSideHits
            }
          };
        }
        
        this.state.hipSwayState.inTargetRegion = inTargetRegion;
        break;
        
      case 'completed':
        // Game is done, no more collisions to check
        break;
    }
    
    return { hit: false };
  }

  private checkHandsCenteringCollisions(data: PoseData): { hit: boolean; hitType?: string; modeProgress?: any; playSound?: boolean } {
    console.log('checkHandsCenteringCollisions called with:', {
      hasLeftHand: !!data.leftHandLandmarks,
      hasRightHand: !!data.rightHandLandmarks,
      leftCount: data.leftHandLandmarks?.length || 0,
      rightCount: data.rightHandLandmarks?.length || 0
    });
    
    if (!data.leftHandLandmarks && !data.rightHandLandmarks) return { hit: false };
    
    const handsState = this.state.handsCenteringState;
    
    switch (handsState.phase) {
      case 'centering':
        // Use the same collision detection as targets, but check both center positions
        const leftHandCentered = this.checkHandCollisionAtPosition(data, handsState.leftCenterX, handsState.leftCenterY, handsState.centeringTolerance);
        const rightHandCentered = this.checkHandCollisionAtPosition(data, handsState.rightCenterX, handsState.rightCenterY, handsState.centeringTolerance);
        const bothHandsCentered = leftHandCentered && rightHandCentered;
        
        console.log('Hands centering debug:', {
          leftHandCentered,
          rightHandCentered,
          bothHandsCentered,
          leftCenter: { x: handsState.leftCenterX, y: handsState.leftCenterY },
          rightCenter: { x: handsState.rightCenterX, y: handsState.rightCenterY },
          tolerance: handsState.centeringTolerance
        });
        
        if (bothHandsCentered) {
          if (!handsState.isCentered) {
            // Just became centered, start timing
            handsState.isCentered = true;
            handsState.centeringStartTime = Date.now();
          } else {
            // Check if centered long enough
            const centeringDuration = Date.now() - (handsState.centeringStartTime || 0);
            if (centeringDuration >= handsState.centeringTimeRequired) {
              // Complete centering phase
              if (this.state.currentTargetData) {
                this.state.currentTargetData.status = 'obtained';
                this.state.currentTargetData.hitTime = Date.now();
                this.state.targetHistory.push({ ...this.state.currentTargetData });
                
                // Create end record for centering phase
                this.state.currentTargetData.status = 'end';
                this.state.targetHistory.push({ ...this.state.currentTargetData });
              }
              
              // Move to targeting phase
              handsState.phase = 'targeting';
              this.state.currentFixedTargetIndex = 1; // Start at index 1
              this.state.currentTarget = this.state.fixedTargets[0]; // Use 0-based array access
              this.createTargetData();
              
              return {
                hit: true,
                hitType: 'centering',
                playSound: false,
                modeProgress: { completed: 1, total: this.state.fixedTargets.length + 1 }
              };
            }
          }
        } else {
          // Not centered, reset centering timer
          handsState.isCentered = false;
          handsState.centeringStartTime = null;
        }
        break;
        
      case 'targeting':
        return this.checkFixedTargetCollisions(data);
        
      case 'completed':
        break;
    }
    
    return { hit: false };
  }

  private checkHeadCenteringCollisions(data: PoseData): { hit: boolean; hitType?: string; modeProgress?: any; playSound?: boolean } {
    if (!data.faceLandmarks && !data.poseLandmarks) return { hit: false };
    
    const headState = this.state.headCenteringState;
    
    switch (headState.phase) {
      case 'centering':
        // Check if head is near center position
        let headCentered = false;
        
        // Check face landmarks (nose)
        if (data.faceLandmarks && data.faceLandmarks[1]) {
          const nose = data.faceLandmarks[1];
          const headX = nose.x * this.width;
          const headY = nose.y * this.height;
          const distance = Math.sqrt(
            Math.pow(headX - headState.centerX, 2) + 
            Math.pow(headY - headState.centerY, 2)
          );
          if (distance <= headState.centeringTolerance) {
            headCentered = true;
          }
        }
        
        // Fallback to pose landmarks if face not available
        if (!headCentered && data.poseLandmarks && data.poseLandmarks[0]) {
          const poseNose = data.poseLandmarks[0];
          const headX = poseNose.x * this.width;
          const headY = poseNose.y * this.height;
          const distance = Math.sqrt(
            Math.pow(headX - headState.centerX, 2) + 
            Math.pow(headY - headState.centerY, 2)
          );
          if (distance <= headState.centeringTolerance) {
            headCentered = true;
          }
        }
        
        if (headCentered) {
          if (!headState.isCentered) {
            // Just became centered, start timing
            headState.isCentered = true;
            headState.centeringStartTime = Date.now();
          } else {
            // Check if centered long enough
            const centeringDuration = Date.now() - (headState.centeringStartTime || 0);
            if (centeringDuration >= headState.centeringTimeRequired) {
              // Complete centering phase
              if (this.state.currentTargetData) {
                this.state.currentTargetData.status = 'obtained';
                this.state.currentTargetData.hitTime = Date.now();
                this.state.targetHistory.push({ ...this.state.currentTargetData });
                
                // Create end record for centering phase
                this.state.currentTargetData.status = 'end';
                this.state.targetHistory.push({ ...this.state.currentTargetData });
              }
              
              // Move to targeting phase
              headState.phase = 'targeting';
              this.state.currentFixedTargetIndex = 1; // Start at index 1
              this.state.currentTarget = this.state.fixedTargets[0]; // Use 0-based array access
              this.createTargetData();
              
              return {
                hit: true,
                hitType: 'centering',
                playSound: false,
                modeProgress: { completed: 1, total: this.state.fixedTargets.length + 1 }
              };
            }
          }
        } else {
          // Not centered, reset centering timer
          headState.isCentered = false;
          headState.centeringStartTime = null;
        }
        break;
        
      case 'targeting':
        return this.checkFixedTargetCollisions(data);
        
      case 'completed':
        break;
    }
    
    return { hit: false };
  }
  
  private checkFixedTargetCollisions(data: PoseData): { hit: boolean; hitType?: string; modeProgress?: any; playSound?: boolean } {
    if (this.state.fixedTargets.length === 0 || this.state.currentFixedTargetIndex > this.state.fixedTargets.length) {
      return { hit: false };
    }
    
    // Convert 1-based index to 0-based for array access
    const arrayIndex = this.state.currentFixedTargetIndex - 1;
    const currentTarget = this.state.fixedTargets[arrayIndex];
    if (!currentTarget) return { hit: false };
    
    let targetHit = false;
    const targetX = currentTarget.x;
    const targetY = currentTarget.y;
    
    if (currentTarget.type === TARGET_TYPES.HAND) {
      targetHit = this.checkHandCollision(data, targetX, targetY);
    } else if (currentTarget.type === TARGET_TYPES.HEAD) {
      targetHit = this.checkHeadCollision(data, targetX, targetY);
    }
    
    if (targetHit) {
      // Create explosion animation
      this.createExplosion(currentTarget);
      
      // Update current target data
      if (this.state.currentTargetData) {
        this.state.currentTargetData.status = 'obtained';
        this.state.currentTargetData.hitTime = Date.now();
        this.state.targetHistory.push({ ...this.state.currentTargetData });
      }
      
      this.state.currentFixedTargetIndex++;
      this.state.gameScore++;
      
      // Create end record for completed target
      if (this.state.currentTargetData) {
        this.state.currentTargetData.status = 'end';
        this.state.targetHistory.push({ ...this.state.currentTargetData });
      }
      
      if (this.state.currentFixedTargetIndex <= this.state.fixedTargets.length) {
        // Convert 1-based index to 0-based for array access
        const nextArrayIndex = this.state.currentFixedTargetIndex - 1;
        if (nextArrayIndex < this.state.fixedTargets.length) {
          this.state.currentTarget = this.state.fixedTargets[nextArrayIndex];
          this.createTargetData(); // Create data for next target
        } else {
          // All targets completed
          this.state.currentTarget = null;
          this.state.currentTargetData = null;
          
          // Mark game as completed
          if (this.gameMode === GAME_MODES.HANDS_FIXED) {
            this.state.handsCenteringState.phase = 'completed';
          } else if (this.gameMode === GAME_MODES.HEAD_FIXED) {
            this.state.headCenteringState.phase = 'completed';
          }
        }
      } else {
        // All targets completed
        this.state.currentTarget = null;
        this.state.currentTargetData = null;
        
        // Mark game as completed
        if (this.gameMode === GAME_MODES.HANDS_FIXED) {
          this.state.handsCenteringState.phase = 'completed';
        } else if (this.gameMode === GAME_MODES.HEAD_FIXED) {
          this.state.headCenteringState.phase = 'completed';
        }
      }
      
      return {
        hit: true,
        hitType: currentTarget.type,
        playSound: true, // Add sound flag
        modeProgress: { 
          completed: this.state.currentFixedTargetIndex + 1, // +1 for centering phase
          total: this.state.fixedTargets.length + 1 // +1 for centering phase
        }
      };
    }
    
    return { hit: false };
  }
  
  private checkRandomTargetCollisions(data: PoseData): { hit: boolean; hitType?: string; hitKeypoint?: string; playSound?: boolean } {
    if (!this.state.currentTarget || !data) return { hit: false };

    let targetHit = false;
    let hitKeypoint = null;
    const targetX = this.state.currentTarget.x;
    const targetY = this.state.currentTarget.y;

    switch(this.state.currentTarget.type) {
      case TARGET_TYPES.HAND:
        if (data.leftHandLandmarks && data.leftHandLandmarks.length > 0) {
          for (let i = 0; i < data.leftHandLandmarks.length; i++) {
            const landmark = data.leftHandLandmarks[i];
            if (landmark && this.checkDistance(landmark.x * this.width, landmark.y * this.height, targetX, targetY)) {
              targetHit = true;
              hitKeypoint = `left_hand_${i}`;
              break;
            }
          }
        }
        if (!targetHit && data.rightHandLandmarks && data.rightHandLandmarks.length > 0) {
          for (let i = 0; i < data.rightHandLandmarks.length; i++) {
            const landmark = data.rightHandLandmarks[i];
            if (landmark && this.checkDistance(landmark.x * this.width, landmark.y * this.height, targetX, targetY)) {
              targetHit = true;
              hitKeypoint = `right_hand_${i}`;
              break;
            }
          }
        }
        break;
        
      case TARGET_TYPES.HEAD:
        if (data.faceLandmarks && data.faceLandmarks.length > 0) {
          const nose = data.faceLandmarks[1];
          if (nose && this.checkDistance(nose.x * this.width, nose.y * this.height, targetX, targetY)) {
            targetHit = true;
            hitKeypoint = 'face_1';
          }
        }
        if (!targetHit && data.poseLandmarks && data.poseLandmarks[0]) {
          const poseNose = data.poseLandmarks[0];
          if (poseNose && this.checkDistance(poseNose.x * this.width, poseNose.y * this.height, targetX, targetY)) {
            targetHit = true;
            hitKeypoint = 'pose_0';
          }
        }
        break;
        
      case TARGET_TYPES.KNEE:
        if (data.poseLandmarks) {
          const leftKnee = data.poseLandmarks[25];
          const rightKnee = data.poseLandmarks[26];
          
          if (leftKnee && this.checkDistance(leftKnee.x * this.width, leftKnee.y * this.height, targetX, targetY)) {
            targetHit = true;
            hitKeypoint = 'pose_25';
          }
          if (!targetHit && rightKnee && this.checkDistance(rightKnee.x * this.width, rightKnee.y * this.height, targetX, targetY)) {
            targetHit = true;
            hitKeypoint = 'pose_26';
          }
        }
        break;
    }

    if (targetHit && !this.state.hitTargetIds.has(this.state.currentTarget.id)) {
      // Create explosion animation
      this.createExplosion(this.state.currentTarget);
      
      this.state.hitTargetIds.add(this.state.currentTarget.id);
      this.state.gameScore++;
      if (this.state.currentTarget.type in this.state.scoreBreakdown) {
        this.state.scoreBreakdown[this.state.currentTarget.type as keyof typeof this.state.scoreBreakdown]++;
      }
      
      if (this.state.currentTargetData) {
        this.state.currentTargetData.status = 'obtained';
        this.state.currentTargetData.hitKeypoint = hitKeypoint;
        this.state.currentTargetData.hitTime = Date.now();
        this.state.targetHistory.push({ ...this.state.currentTargetData });
      }
      
      const hitTargetType = this.state.currentTarget.type;
      
      setTimeout(() => {
        if (this.state.currentTargetData) {
          this.state.currentTargetData.status = 'end';
          this.state.targetHistory.push({ ...this.state.currentTargetData });
        }
        
        this.state.currentTarget = this.generateRandomTarget();
        this.createTargetData();
      }, 100);
      
      return { hit: true, hitType: hitTargetType, hitKeypoint: hitKeypoint || undefined, playSound: true };
    }
    
    return { hit: false };
  }
  
  private checkHandCollision(data: PoseData, targetX: number, targetY: number): boolean {
    if (data.leftHandLandmarks) {
      for (let landmark of data.leftHandLandmarks) {
        if (landmark && this.checkDistance(landmark.x * this.width, landmark.y * this.height, targetX, targetY)) {
          return true;
        }
      }
    }
    if (data.rightHandLandmarks) {
      for (let landmark of data.rightHandLandmarks) {
        if (landmark && this.checkDistance(landmark.x * this.width, landmark.y * this.height, targetX, targetY)) {
          return true;
        }
      }
    }
    return false;
  }

  // Helper method for centering phase - same logic as checkHandCollision but with custom tolerance
  private checkHandCollisionAtPosition(data: PoseData, targetX: number, targetY: number, tolerance: number): boolean {
    if (data.leftHandLandmarks) {
      for (let landmark of data.leftHandLandmarks) {
        if (landmark) {
          const distance = Math.sqrt(
            (landmark.x * this.width - targetX) ** 2 + 
            (landmark.y * this.height - targetY) ** 2
          );
          if (distance <= tolerance) {
            return true;
          }
        }
      }
    }
    if (data.rightHandLandmarks) {
      for (let landmark of data.rightHandLandmarks) {
        if (landmark) {
          const distance = Math.sqrt(
            (landmark.x * this.width - targetX) ** 2 + 
            (landmark.y * this.height - targetY) ** 2
          );
          if (distance <= tolerance) {
            return true;
          }
        }
      }
    }
    return false;
  }
  
  private checkHeadCollision(data: PoseData, targetX: number, targetY: number): boolean {
    if (data.faceLandmarks && data.faceLandmarks[1]) {
      const nose = data.faceLandmarks[1];
      if (this.checkDistance(nose.x * this.width, nose.y * this.height, targetX, targetY)) {
        return true;
      }
    }
    if (data.poseLandmarks && data.poseLandmarks[0]) {
      const poseNose = data.poseLandmarks[0];
      if (this.checkDistance(poseNose.x * this.width, poseNose.y * this.height, targetX, targetY)) {
        return true;
      }
    }
    return false;
  }

  private checkDistance(x1: number, y1: number, x2: number, y2: number): boolean {
    const distance = Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
    return distance <= this.state.targetRadius;
  }

  // Target data management
  private createTargetData(): void {
    if (!this.state.currentTarget) return;
    
    // Determine current game phase
    let gamePhase = 'targeting';
    let targetIndex = null;
    let trialNumber = null;
    
    switch (this.gameMode) {
      case GAME_MODES.HIPS_SWAY:
        gamePhase = this.state.hipSwayState.phase;
        trialNumber = this.state.hipSwayState.currentTrial;
        break;
      case GAME_MODES.HANDS_FIXED:
        gamePhase = this.state.handsCenteringState.phase === 'centering' ? 'centering' : 
                   (this.state.currentFixedTargetIndex === 1 ? 'starting' : 'targeting');
        targetIndex = this.state.currentFixedTargetIndex;
        break;
      case GAME_MODES.HEAD_FIXED:
        gamePhase = this.state.headCenteringState.phase === 'centering' ? 'centering' : 
                   (this.state.currentFixedTargetIndex === 1 ? 'starting' : 'targeting');
        targetIndex = this.state.currentFixedTargetIndex;
        break;
      case GAME_MODES.RANDOM:
        gamePhase = 'targeting';
        break;
    }
    
    this.state.currentTargetData = {
      targetShowing: true,
      targetId: this.state.currentTarget.id,
      targetType: this.state.currentTarget.type,
      targetX: this.state.currentTarget.x / this.width,
      targetY: this.state.currentTarget.y / this.height,
      targetPixelX: this.state.currentTarget.x,
      targetPixelY: this.state.currentTarget.y,
      status: 'start',
      startTime: Date.now(),
      hitKeypoint: null,
      hitTime: null,
      gameMode: this.gameMode,
      gamePhase: gamePhase,
      targetIndex: targetIndex,
      trialNumber: trialNumber
    };
    
    this.state.targetHistory.push({ ...this.state.currentTargetData });
    this.state.currentTargetData.status = 'unobtained';
  }

  public getCurrentTargetData(): TargetData {
    return this.state.currentTargetData ? {
      ...this.state.currentTargetData,
      targetShowing: !!this.state.currentTarget
    } : {
      targetShowing: false,
      targetId: null,
      targetType: null,
      targetX: null,
      targetY: null,
      targetPixelX: null,
      targetPixelY: null,
      status: null,
      startTime: null,
      hitTime: null,
      hitKeypoint: null,
      gameMode: this.gameMode,
      gamePhase: 'inactive',
      targetIndex: null,
      trialNumber: null
    };
  }

  // Check if the current game mode is complete
  public isGameComplete(): boolean {
    switch (this.gameMode) {
      case GAME_MODES.HIPS_SWAY:
        return this.state.hipSwayState.phase === 'completed';
      case GAME_MODES.HANDS_FIXED:
        return this.state.handsCenteringState.phase === 'completed' || 
               (this.state.handsCenteringState.phase === 'targeting' && 
                this.state.currentFixedTargetIndex > this.state.fixedTargets.length);
      case GAME_MODES.HEAD_FIXED:
        return this.state.headCenteringState.phase === 'completed' || 
               (this.state.headCenteringState.phase === 'targeting' && 
                this.state.currentFixedTargetIndex > this.state.fixedTargets.length);
      case GAME_MODES.RANDOM:
        // Random mode doesn't auto-complete, relies on external timer
        return false;
      default:
        return false;
    }
  }

  // Hip sway centering phase data tracking
  private createHipSwayCenteringData(): void {
    const hipRegions = this.generateHipSwayRegions();
    const trialNumber = this.formatTrialNumber(this.state.hipSwayState.currentTrial);
    
    // Create a virtual target for the centering line
    const virtualTarget = {
      id: `hip-centering-${trialNumber}`,
      type: 'centering' as any, // Special type for centering phase
      x: hipRegions.centerLine.x,
      y: hipRegions.centerLine.y + hipRegions.centerLine.height / 2,
      color: '#ffffff'
    };
    
    this.state.currentTargetData = {
      targetShowing: true,
      targetId: virtualTarget.id,
      targetType: 'centering' as any,
      targetX: virtualTarget.x / this.width,
      targetY: virtualTarget.y / this.height,
      targetPixelX: virtualTarget.x,
      targetPixelY: virtualTarget.y,
      status: 'start',
      startTime: Date.now(),
      hitKeypoint: null,
      hitTime: null,
      gameMode: this.gameMode,
      gamePhase: this.state.hipSwayState.phase,
      targetIndex: null,
      trialNumber: this.state.hipSwayState.currentTrial
    };
    
    this.state.targetHistory.push({ ...this.state.currentTargetData });
    this.state.currentTargetData.status = 'unobtained';
  }

  // Hip sway specific data tracking
  private createHipSwayTargetData(targetSide: 'left' | 'right'): void {
    const hipRegions = this.generateHipSwayRegions();
    const targetRegion = targetSide === 'left' ? hipRegions.leftRegion : hipRegions.rightRegion;
    const trialNumber = this.formatTrialNumber(this.state.hipSwayState.currentTrial);
    
    // Create a virtual target for the hip sway region
    const virtualTarget = {
      id: `hip-${targetSide}-${trialNumber}`,
      type: targetSide === 'left' ? TARGET_TYPES.HIP_LEFT : TARGET_TYPES.HIP_RIGHT,
      x: targetRegion.x + targetRegion.width / 2,
      y: targetRegion.y + targetRegion.height / 2,
      color: targetSide === 'left' ? TARGET_COLORS[TARGET_TYPES.HIP_LEFT] : TARGET_COLORS[TARGET_TYPES.HIP_RIGHT]
    };
    
    this.state.currentTargetData = {
      targetShowing: true,
      targetId: virtualTarget.id,
      targetType: virtualTarget.type,
      targetX: virtualTarget.x / this.width,
      targetY: virtualTarget.y / this.height,
      targetPixelX: virtualTarget.x,
      targetPixelY: virtualTarget.y,
      status: 'start',
      startTime: Date.now(),
      hitKeypoint: null,
      hitTime: null,
      gameMode: this.gameMode,
      gamePhase: this.state.hipSwayState.phase,
      targetIndex: null,
      trialNumber: this.state.hipSwayState.currentTrial
    };
    
    this.state.targetHistory.push({ ...this.state.currentTargetData });
    this.state.currentTargetData.status = 'unobtained';
  }

  // Hands centering phase data tracking
  private createHandsCenteringData(): void {
    const handsState = this.state.handsCenteringState;
    
    // Create a virtual target for the hands centering phase
    const virtualTarget = {
      id: 'hands-centering-001',
      type: 'centering' as any, // Special type for centering phase
      x: (handsState.leftCenterX + handsState.rightCenterX) / 2, // Midpoint between centers
      y: handsState.leftCenterY,
      color: '#ffffff'
    };
    
    this.state.currentTargetData = {
      targetShowing: true,
      targetId: virtualTarget.id,
      targetType: 'centering' as any,
      targetX: virtualTarget.x / this.width,
      targetY: virtualTarget.y / this.height,
      targetPixelX: virtualTarget.x,
      targetPixelY: virtualTarget.y,
      status: 'start',
      startTime: Date.now(),
      hitKeypoint: null,
      hitTime: null,
      gameMode: this.gameMode,
      gamePhase: handsState.phase,
      targetIndex: null,
      trialNumber: null
    };
    
    this.state.targetHistory.push({ ...this.state.currentTargetData });
    this.state.currentTargetData.status = 'unobtained';
  }

  // Head centering phase data tracking
  private createHeadCenteringData(): void {
    const headState = this.state.headCenteringState;
    
    // Create a virtual target for the head centering phase
    const virtualTarget = {
      id: 'head-centering-001',
      type: 'centering' as any, // Special type for centering phase
      x: headState.centerX,
      y: headState.centerY,
      color: '#ffffff'
    };
    
    this.state.currentTargetData = {
      targetShowing: true,
      targetId: virtualTarget.id,
      targetType: 'centering' as any,
      targetX: virtualTarget.x / this.width,
      targetY: virtualTarget.y / this.height,
      targetPixelX: virtualTarget.x,
      targetPixelY: virtualTarget.y,
      status: 'start',
      startTime: Date.now(),
      hitKeypoint: null,
      hitTime: null,
      gameMode: this.gameMode,
      gamePhase: headState.phase,
      targetIndex: null,
      trialNumber: null
    };
    
    this.state.targetHistory.push({ ...this.state.currentTargetData });
    this.state.currentTargetData.status = 'unobtained';
  }

  // Update canvas dimensions
  public updateDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  // Update game mode
  public updateGameMode(gameMode: GameMode): void {
    this.gameMode = gameMode;
  }

  // Explosion management
  private createExplosion(target: Target): void {
    const particles: ExplosionParticle[] = [];
    const targetRadius = this.state.targetRadius; // Use the actual target radius (50px)
    
    // Create multiple rings of particles for a fuller effect
    const rings = [
      { count: 8, radius: 0, speed: 150, size: 6 }, // Center burst
      { count: 12, radius: targetRadius * 0.3, speed: 120, size: 5 }, // Inner ring
      { count: 16, radius: targetRadius * 0.7, speed: 100, size: 4 }, // Middle ring  
      { count: 20, radius: targetRadius, speed: 80, size: 3 } // Outer ring (target circumference)
    ];
    
    rings.forEach(ring => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const baseSpeed = ring.speed + Math.random() * 50;
        const life = 0.8 + Math.random() * 0.4; // 0.8-1.2 seconds
        
        // Starting position on the ring circumference
        const startX = target.x + Math.cos(angle) * ring.radius;
        const startY = target.y + Math.sin(angle) * ring.radius;
        
        particles.push({
          x: startX,
          y: startY,
          velocityX: Math.cos(angle) * baseSpeed,
          velocityY: Math.sin(angle) * baseSpeed,
          size: ring.size + Math.random() * 3,
          life: life,
          maxLife: life,
          color: target.color
        });
      }
    });
    
    // Add some random scattered particles for extra flair
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * targetRadius;
      const speed = 60 + Math.random() * 80;
      const life = 0.6 + Math.random() * 0.5;
      
      particles.push({
        x: target.x + Math.cos(angle) * distance,
        y: target.y + Math.sin(angle) * distance,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        life: life,
        maxLife: life,
        color: target.color
      });
    }
    
    const explosion: TargetExplosion = {
      id: target.id,
      x: target.x,
      y: target.y,
      color: target.color,
      startTime: Date.now(),
      duration: 1200, // 1.2s total duration for longer effect
      particles: particles
    };
    
    this.state.activeExplosions.push(explosion);
  }

  public updateExplosions(): void {
    const currentTime = Date.now();
    
    // Update existing explosions
    this.state.activeExplosions = this.state.activeExplosions.filter(explosion => {
      const elapsed = (currentTime - explosion.startTime) / 1000; // Convert to seconds
      
      if (elapsed > explosion.duration / 1000) {
        return false; // Remove expired explosions
      }
      
      // Update particles
      explosion.particles = explosion.particles.filter(particle => {
        particle.life -= 1/60; // Assume 60fps
        
        if (particle.life <= 0) {
          return false; // Remove dead particles
        }
        
        // Update particle position
        particle.x += particle.velocityX / 60;
        particle.y += particle.velocityY / 60;
        
        // Apply gravity to Y velocity
        particle.velocityY += 200 / 60; // 200 pixels/sec^2 gravity
        
        // Apply air resistance
        particle.velocityX *= 0.98;
        particle.velocityY *= 0.98;
        
        return true;
      });
      
      return explosion.particles.length > 0;
    });
  }
}