/**
 * Recording Service
 * Handles CSV data recording, video recording, and file generation
 */

import type { PoseResults } from './mediaPipeService.js';

// Type definitions
export interface UserSettings {
  username?: string;
  [key: string]: any;
}

export interface RecordingSession {
  participantId: string;
  timestamp: string;
  filename: string;
  csvContent: string;
  performanceStartTime: number;
}

export interface TargetData {
  targetShowing: boolean;
  targetId: string | null;
  targetType: string | null;
  targetX: number | null;
  targetY: number | null;
  status: string | null;
}

/**
 * Generate timestamp for file naming
 */
export function generateTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: YYYY-MM-DDTHH-MM-SS
}

/**
 * Generate participant ID
 */
export function generateParticipantId(userSettings: UserSettings): string {
  return userSettings.username || `P${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

/**
 * Create CSV header for pose data recording
 */
export function createCSVHeader() {
  const header = [
    'unix_timestamp_ms', // Unix timestamp in milliseconds since epoch
    'frame_time_ms',     // High-precision milliseconds since recording started
    'pose_landmarks_count',
    'left_hand_landmarks_count', 
    'right_hand_landmarks_count',
    'face_landmarks_count',
    // Target data columns
    'target_showing',    // Boolean: is a target currently displayed
    'target_id',         // Unique identifier for the target
    'target_type',       // Type: hand, head, or knee
    'target_x',          // Target X position (normalized 0-1, same as MediaPipe coordinates)
    'target_y',          // Target Y position (normalized 0-1, same as MediaPipe coordinates)
    'target_status'      // Status: start, unobtained, obtained, end
  ];

  // Add pose landmark columns (33 landmarks, each with x, y, z, visibility)
  for (let i = 0; i < 33; i++) {
    header.push(`pose_${i}_x`, `pose_${i}_y`, `pose_${i}_z`, `pose_${i}_visibility`);
  }

  // Add left hand landmark columns (21 landmarks, each with x, y, z)
  for (let i = 0; i < 21; i++) {
    header.push(`left_hand_${i}_x`, `left_hand_${i}_y`, `left_hand_${i}_z`);
  }

  // Add right hand landmark columns (21 landmarks, each with x, y, z)
  for (let i = 0; i < 21; i++) {
    header.push(`right_hand_${i}_x`, `right_hand_${i}_y`, `right_hand_${i}_z`);
  }

  // Add face landmark columns (468 landmarks, each with x, y, z)
  for (let i = 0; i < 468; i++) {
    header.push(`face_${i}_x`, `face_${i}_y`, `face_${i}_z`);
  }

  return header.join(',') + '\n';
}

/**
 * Format pose data for CSV recording
 */
export function formatPoseDataForCSV(
  poseData: PoseResults, 
  timestamp: number, 
  frameTime: number
): string {
  // Get current target data from global window object
  const targetData = globalThis.currentTargetData || {
    targetShowing: false,
    targetId: null,
    targetType: null,
    targetX: null,
    targetY: null,
    status: null
  };

  const row = [
    timestamp,
    frameTime,
    poseData.poseLandmarks ? poseData.poseLandmarks.length : 0,
    poseData.leftHandLandmarks ? poseData.leftHandLandmarks.length : 0,
    poseData.rightHandLandmarks ? poseData.rightHandLandmarks.length : 0,
    poseData.faceLandmarks ? poseData.faceLandmarks.length : 0,
    targetData.targetShowing,
    targetData.targetId,
    targetData.targetType,
    targetData.targetX,
    targetData.targetY,
    targetData.status
  ];

  // Add pose landmarks (33 landmarks)
  const poseLandmarks = poseData.poseLandmarks || [];
  for (let i = 0; i < 33; i++) {
    const landmark = poseLandmarks[i];
    if (landmark) {
      row.push(landmark.x, landmark.y, landmark.z, landmark.visibility || 1);
    } else {
      row.push('', '', '', '');
    }
  }

  // Add left hand landmarks (21 landmarks)
  const leftHandLandmarks = poseData.leftHandLandmarks || [];
  for (let i = 0; i < 21; i++) {
    const landmark = leftHandLandmarks[i];
    if (landmark) {
      row.push(landmark.x, landmark.y, landmark.z);
    } else {
      row.push('', '', '');
    }
  }

  // Add right hand landmarks (21 landmarks)
  const rightHandLandmarks = poseData.rightHandLandmarks || [];
  for (let i = 0; i < 21; i++) {
    const landmark = rightHandLandmarks[i];
    if (landmark) {
      row.push(landmark.x, landmark.y, landmark.z);
    } else {
      row.push('', '', '');
    }
  }

  // Add face landmarks (468 landmarks)
  const faceLandmarks = poseData.faceLandmarks || [];
  for (let i = 0; i < 468; i++) {
    const landmark = faceLandmarks[i];
    if (landmark) {
      row.push(landmark.x, landmark.y, landmark.z);
    } else {
      row.push('', '', '');
    }
  }

  return row.join(',') + '\n';
}

/**
 * Start recording session
 */
export function startRecordingSession(participantId: string, timestamp: string): RecordingSession {
  const filename = `${participantId}_${timestamp}.csv`;
  
  return {
    participantId,
    timestamp,
    filename,
    csvContent: createCSVHeader(),
    performanceStartTime: performance.now()
  };
}

/**
 * Download file as blob
 */
export function downloadFile(content, filename, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Start video recording
 */
export async function startVideoRecording(videoStream, participantId, timestamp) {
  if (!videoStream) {
    throw new Error('Video stream not available for recording');
  }

  const videoFilename = `${participantId}_${timestamp}_video.webm`;
  let videoChunks = [];

  // Try different MIME types for better compatibility
  let options = { mimeType: 'video/webm;codecs=vp9' };
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options = { mimeType: 'video/webm;codecs=vp8' };
  }
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options = { mimeType: 'video/webm' };
  }
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options = {};
  }

  const mediaRecorder = new MediaRecorder(videoStream, options);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      videoChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
    downloadFile(videoBlob, videoFilename, 'video/webm');
    videoChunks = [];
  };

  mediaRecorder.start();
  console.log('Video recording started:', videoFilename);
  
  return {
    mediaRecorder,
    filename: videoFilename
  };
}

/**
 * Stop video recording
 */
export function stopVideoRecording(mediaRecorder) {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    console.log('Video recording stopped');
  }
}