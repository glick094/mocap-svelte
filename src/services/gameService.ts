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

export interface GameState {
  gameScore: number;
  targetRadius: number;
  hitTargetIds: Set<string | number>;
  scoreBreakdown: {
    hand: number;
    head: number;
    knee: number;
  };
  targetHistory: any[];
  currentTargetData: any;
  hipSwayState: HipSwayState;
  fixedTargets: Target[];
  currentFixedTargetIndex: number;
  currentTarget: Target | null;
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

  constructor(width: number, height: number, gameMode: GameMode = GAME_MODES.RANDOM) {
    this.width = width;
    this.height = height;
    this.gameMode = gameMode;
    this.state = this.initializeGameState();
  }

  private initializeGameState(): GameState {
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
      fixedTargets: [],
      currentFixedTargetIndex: 0,
      currentTarget: null
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

  // Target generation functions
  public generateFigure8Targets(): Target[] {
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const radiusX = this.width * 0.15;
    const radiusY = this.height * 0.1;
    
    const targets: Target[] = [];
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * 2 * Math.PI;
      const x = centerX + radiusX * Math.sin(t);
      const y = centerY + radiusY * Math.sin(2 * t);
      
      targets.push({
        id: `figure8_${i}`,
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
    const radius = Math.min(this.width, this.height) * 0.12;
    
    const targets: Target[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      targets.push({
        id: `circle_${i}`,
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

    return {
      id: Date.now() + Math.random(),
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
    
    switch (this.gameMode) {
      case GAME_MODES.HIPS_SWAY:
        this.state.hipSwayState = {
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
            animationDuration: 800
          },
          lastHipPosition: null
        };
        this.state.currentTarget = null;
        break;
        
      case GAME_MODES.HANDS_FIXED:
        this.state.fixedTargets = this.generateFigure8Targets();
        this.state.currentFixedTargetIndex = 0;
        this.state.currentTarget = this.state.fixedTargets[0];
        break;
        
      case GAME_MODES.HEAD_FIXED:
        this.state.fixedTargets = this.generateCircleTargets();
        this.state.currentFixedTargetIndex = 0;
        this.state.currentTarget = this.state.fixedTargets[0];
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
      case GAME_MODES.HEAD_FIXED:
        return this.checkFixedTargetCollisions(data);
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
              // Move to targeting phase
              this.state.hipSwayState.phase = 'targeting';
              this.state.hipSwayState.targetSide = 'left'; // Start with left
              this.state.hipSwayState.centeringStartTime = null;
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
          } else {
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
  
  private checkFixedTargetCollisions(data: PoseData): { hit: boolean; hitType?: string; modeProgress?: any; playSound?: boolean } {
    if (this.state.fixedTargets.length === 0 || this.state.currentFixedTargetIndex >= this.state.fixedTargets.length) {
      return { hit: false };
    }
    
    const currentTarget = this.state.fixedTargets[this.state.currentFixedTargetIndex];
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
      this.state.currentFixedTargetIndex++;
      this.state.gameScore++;
      
      if (this.state.currentFixedTargetIndex < this.state.fixedTargets.length) {
        this.state.currentTarget = this.state.fixedTargets[this.state.currentFixedTargetIndex];
      }
      
      return {
        hit: true,
        hitType: currentTarget.type,
        modeProgress: { 
          completed: this.state.currentFixedTargetIndex, 
          total: this.state.fixedTargets.length 
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
      
      return { hit: true, hitType: hitTargetType, hitKeypoint };
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
    
    this.state.currentTargetData = {
      targetShowing: true,
      targetId: this.state.currentTarget.id,
      targetType: this.state.currentTarget.type,
      targetX: this.state.currentTarget.x / this.width,
      targetY: this.state.currentTarget.y / this.height,
      status: 'start',
      startTime: Date.now(),
      hitKeypoint: undefined,
      hitTime: null
    };
    
    this.state.targetHistory.push({ ...this.state.currentTargetData });
    this.state.currentTargetData.status = 'unobtained';
  }

  public getCurrentTargetData(): any {
    return this.state.currentTargetData ? {
      targetShowing: !!this.state.currentTarget,
      targetId: this.state.currentTargetData.targetId,
      targetType: this.state.currentTargetData.targetType,
      targetX: this.state.currentTargetData.targetX,
      targetY: this.state.currentTargetData.targetY,
      status: this.state.currentTargetData.status,
      hitTime: this.state.currentTargetData.hitTime
    } : {
      targetShowing: false,
      targetId: undefined,
      targetType: undefined,
      targetX: undefined,
      targetY: undefined,
      status: undefined,
      hitTime: undefined
    };
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
}