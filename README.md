# Play2Move: Motion Capture Game Platform

A real-time motion capture game platform that combines MediaPipe pose detection with an interactive target-hitting game. Players use their body movements to hit targets with different body parts while comprehensive data is recorded for research and analysis.

## Quickstart

### Prerequisites
- Node.js 18+ and npm
- Modern web browser with WebRTC support
- Webcam access

### Installation & Running
```bash
# Clone and install dependencies
npm install

# Start development server
npm run dev -- --open
```

### How to Play
1. **Start Camera**: Click "📷 Start Camera" to enable webcam
2. **Participant Setup**: Enter participant ID manually or scan QR code with demographics
3. **Begin Game**: Click "🎮 Start Game" to spawn targets
4. **Hit Targets**: Move your body to hit colored targets:
   - 🔴 **Red targets**: Hit with hands
   - 🟢 **Green targets**: Hit with head/face 
   - 🔵 **Blue targets**: Hit with knees
5. **Record Data**: Click "🔴 Record Data" to capture motion and game data
6. **View Progress**: Check your score breakdown in the side panel

## Game Window Overview

The interface consists of three main areas:

### Header Controls
- **Camera Toggle**: Enable/disable webcam feed
- **Recording**: Start/stop data capture (exports CSV + video)
- **Game Controls**: Start/stop target game with live score display
- **Settings**: Configure capture quality, smoothing, and canvas dimensions

### Main Canvas ([ThreeJSCanvas.svelte](src/lib/ThreeJSCanvas.svelte))
- **Real-time Pose Visualization**: Color-coded skeletal overlay
  - Green: Head/face landmarks and connections
  - Red: Hand landmarks and connections  
  - Blue: Leg/knee landmarks and connections
- **Interactive Targets**: Dynamically positioned game targets with collision detection
- **Mirrored Display**: Natural mirror-like interaction

### Side Panel ([WebcamPose.svelte](src/lib/WebcamPose.svelte))
- **Participant Input**: Manual ID entry with automatic QR code scanning
- **Webcam Feed**: Live camera view with pose overlay
- **MediaPipe Status**: Connection and processing status
- **Pose Controls**: Toggle visibility of pose, hands, and face tracking
- **Game Stats**: Real-time score tracking and breakdown by body part

## Methodology

### Pose Detection
The platform uses **Google MediaPipe Holistic** for comprehensive human pose estimation:

- **33 Pose Landmarks**: Full body skeletal tracking
- **21 Hand Landmarks** (per hand): Detailed finger and palm tracking  
- **468 Face Landmarks**: Facial feature detection
- **Real-time Processing**: ~30 FPS pose estimation

Implementation: [WebcamPose.svelte](src/lib/WebcamPose.svelte#L188-L339)

### Motion Smoothing
Raw pose data is processed using a **Savitzky-Golay filter** to reduce noise while preserving motion dynamics:

- **Configurable Window Size**: Default 5-frame window (adjustable in settings)
- **Polynomial Order**: 2nd-order polynomial fitting
- **Temporal Coherence**: Maintains natural movement flow

Implementation: [+page.svelte](src/routes/+page.svelte#L217-L370)

### Game Mechanics
Target generation and collision detection system:

- **Adaptive Positioning**: Targets spawn in anatomically appropriate regions
  - Head targets: Upper 1/3 of screen (with 10% top margin for reachability)
  - Hand targets: Full capture area  
  - Knee targets: Lower 50%-75% height range
- **Enhanced Collision**: Uses all hand landmarks (not just fingertips) for robust detection
- **Real-time Feedback**: Immediate visual and scoring response

Implementation: [ThreeJSCanvas.svelte](src/lib/ThreeJSCanvas.svelte#L135-L290)

## Data Recording

### Dual Data Streams
The platform captures two synchronized datasets:

1. **Raw MediaPipe Data** ([+page.svelte](src/routes/+page.svelte#L196-L208))
   - Unfiltered pose landmarks directly from MediaPipe
   - High temporal resolution for detailed analysis
   - Includes confidence scores and visibility flags

2. **Processed Game Data** ([+page.svelte](src/routes/+page.svelte#L108-L121))
   - Smoothed pose data used for visualization
   - Game state information and target interactions
   - Collision events with hit keypoint identification

### Exported Data Format
Each recording session generates:

- **CSV Files**: Timestamped pose and game data with comprehensive target tracking
- **Video Recording**: WebM format webcam capture
- **Synchronized Timestamps**: Unix timestamps + high-precision frame timing

CSV includes target data: `target_showing`, `target_id`, `target_type`, `target_x`, `target_y`, `target_status`

Implementation: [+page.svelte](src/routes/+page.svelte#L385-L493)

## Participant Management

### QR Code Integration
The platform supports automatic participant setup via QR code scanning:

**QR Code Format**:
```json
{
  "participantid": "P001",
  "age": 25,
  "height": 175
}
```

**Enhanced QR Scanner Features**:
- **Shared Camera Stream**: QR scanner uses the same camera feed as MediaPipe to prevent conflicts
- **Modal Interface**: Full-screen scanning modal with live camera preview
- **Real-time Detection**: Up to 10 scans per second with optimized scan region
- **Test Mode**: Built-in test button to verify detection workflow without physical QR codes
- **Improved Reliability**: Fixed infinite restart loops and stream conflicts

**Behavior**:
- QR scanning is active only when the game is **not** running
- Scans every 500ms with 500ms throttling to prevent duplicate reads
- Manual participant ID entry overrides QR code data
- Demographics (age, height) are recorded in CSV output
- Automatic modal closure after successful scan

**Camera Stream Management**:
The QR scanner now shares the camera stream with MediaPipe instead of requesting separate access:
- Prevents "device busy" errors
- Ensures clean video feed without pose tracking overlays
- Seamless transition between pose tracking and QR scanning modes

**Test QR Generator**:
Use `test-qr.html` to generate QR codes for testing. Open the file in a browser and enter participant information.

Implementation: [QRScanModal.svelte](src/lib/QRScanModal.svelte) and [WebcamPose.svelte](src/lib/WebcamPose.svelte#L476-L539)

## Developer Guide

### Project Structure
```
src/
├── lib/
│   ├── ThreeJSCanvas.svelte    # Main game canvas and pose visualization
│   ├── WebcamPose.svelte       # MediaPipe integration and webcam
│   ├── QRScanModal.svelte      # QR code scanning modal interface
│   ├── SettingsModal.svelte    # Configuration interface
│   └── ControlPanel.svelte     # Recording and playback controls
├── routes/
│   └── +page.svelte           # Main application layout and data handling
```

### Key Technologies
- **Frontend**: SvelteKit + TypeScript
- **Pose Detection**: MediaPipe Holistic (WebAssembly)
- **Signal Processing**: Custom Savitzky-Golay implementation
- **Graphics**: HTML5 Canvas 2D API
- **Data Export**: Browser-native Blob API for file generation

### Configuration Options
Accessible via Settings modal ([SettingsModal.svelte](src/lib/SettingsModal.svelte)):

- **Capture Quality**: Resolution and frame rate settings
- **Smoothing Parameters**: Filter window size and polynomial order  
- **Canvas Dimensions**: Custom viewport sizing
- **User Identification**: Participant ID for data organization

### Development Commands
```bash
# Development with hot reload
npm run dev

# Type checking
npm run check

# Production build
npm run build

# Preview production build  
npm run preview

# Run tests
npm run test
```

### Browser Requirements
- **WebRTC Support**: For webcam access
- **WebAssembly**: For MediaPipe processing
- **Modern JavaScript**: ES2020+ features
- **Canvas 2D**: Hardware-accelerated rendering preferred

## Troubleshooting

### QR Code Scanning Issues

**QR Code Not Detected**:
1. Ensure QR code contains valid JSON with `participantid` field
2. Hold QR code steady in the center of the camera view
3. Ensure adequate lighting on the QR code
4. Try using the "Test with Sample QR Data" button to verify the detection workflow
5. Check browser console for any error messages

**Camera Access Problems**:
- Make sure you're accessing the site via HTTPS (required for camera access)
- Grant camera permissions when prompted by the browser
- Close other applications that might be using the camera
- The application automatically shares camera stream between MediaPipe and QR scanner

**Performance Issues**:
- Reduce MediaPipe model complexity in settings if scanning is slow
- Ensure good lighting conditions for both pose tracking and QR scanning
- Consider using a dedicated QR code reader app if browser scanning fails

## Research Applications

This platform is designed for:
- **Motor Learning Studies**: Quantitative movement analysis
- **Rehabilitation Research**: Progress tracking and assessment
- **Game-Based Interventions**: Engagement and motivation measurement
- **Biomechanics Research**: Detailed motion capture without specialized equipment

## Contributing

The codebase uses:
- **TypeScript**: For type safety and developer experience
- **Svelte Reactivity**: For efficient real-time updates
- **Modular Architecture**: Separation of concerns for maintainability

Key extension points:
- **Target Types**: Add new target types in [ThreeJSCanvas.svelte](src/lib/ThreeJSCanvas.svelte#L123-L133)
- **Export Formats**: Modify data structure in [+page.svelte](src/routes/+page.svelte#L425-L493)  
- **Pose Processing**: Extend filtering in [smoothLandmarks function](src/routes/+page.svelte#L335-L370)

## License

MIT License - see LICENSE file for details.https://glick094.github.io/mocap-svelte/