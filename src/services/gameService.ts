/**
 * Game Service
 * Handles game logic, state management, and collision detection for motion capture games
 */

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
  currentTrial: number;
  targetSide: 'left' | 'right';
  inTargetRegion: boolean;
  trialCompleted: boolean;
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
        currentTrial: 0,
        targetSide: 'left',
        inTargetRegion: false,
        trialCompleted: false
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
          currentTrial: 0,
          targetSide: 'left',
          inTargetRegion: false,
          trialCompleted: false
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
  public checkCollisions(data: PoseData): { hit: boolean; hitType?: string; modeProgress?: any } {
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

  private checkHipSwayCollisions(data: PoseData): { hit: boolean; hitType?: string; modeProgress?: any } {
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
    } else {
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
      this.state.hipSwayState.trialCompleted = true;
      this.state.hipSwayState.currentTrial++;
      this.state.gameScore++;
      
      const isComplete = this.state.hipSwayState.currentTrial >= 8;
      
      if (!isComplete) {
        setTimeout(() => {
          this.state.hipSwayState.targetSide = this.state.hipSwayState.targetSide === 'left' ? 'right' : 'left';
          this.state.hipSwayState.trialCompleted = false;
        }, 500);
      }
      
      this.state.hipSwayState.inTargetRegion = inTargetRegion;
      
      return { 
        hit: true, 
        hitType: `hip-${this.state.hipSwayState.targetSide}`,
        modeProgress: { completed: this.state.hipSwayState.currentTrial, total: 8 }
      };
    }
    
    this.state.hipSwayState.inTargetRegion = inTargetRegion;
    return { hit: false };
  }
  
  private checkFixedTargetCollisions(data: PoseData): { hit: boolean; hitType?: string; modeProgress?: any } {
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
  
  private checkRandomTargetCollisions(data: PoseData): { hit: boolean; hitType?: string; hitKeypoint?: string } {
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
      status: this.state.currentTargetData.status
    } : {
      targetShowing: false,
      targetId: undefined,
      targetType: undefined,
      targetX: undefined,
      targetY: undefined,
      status: undefined
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