# Play2Move: Motion Capture Game Platform

A real-time motion capture game platform that combines MediaPipe pose detection with an interactive target-hitting game. Players use their body movements to hit targets with different body parts while comprehensive data is recorded for research and analysis.

## Recent Updates (Data Collection Focus)

The interface has been streamlined for optimal data collection:

- **Simplified UI**: Removed version badges and non-essential elements
- **Hidden Pose Overlay**: Pose visualization is hidden by default for cleaner video recording
- **Keyboard Shortcuts**: Added CTRL+ENTER (start) and CTRL+ESC (stop) for hands-free control
- **Real-time Status**: Bottom status bar shows live system state with reactive updates
- **Right-aligned Status**: Status indicators positioned on the right for better visibility

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
3. **Begin Games**: Click "▶️ Play games" or press **CTRL+ENTER** to start the game sequence
4. **Hit Targets**: Move your body to hit colored targets:
   - 🔴 **Red targets**: Hit with hands
   - 🟢 **Green targets**: Hit with head/face
   - 🔵 **Blue targets**: Hit with knees
5. **End Games**: Click "⏹️ Stop games" or press **CTRL+ESC** to end at any time
6. **Monitor Status**: Check system status in the bottom status bar

## Game Window Overview

The simplified interface focuses on data collection with streamlined controls:

### Header Controls

- **Camera Toggle**: Enable/disable webcam feed
- **Pose Visibility**: Show/hide pose overlay (default: hidden for cleaner data collection)
- **Mode Toggle**: Switch between Default (automatic game sequence) and Manual modes
- **Game Controls**: Start/stop games with live score display
- **Settings**: Configure capture quality, smoothing, and canvas dimensions (accessible via CTRL+click or settings modal)

### Keyboard Shortcuts

- **CTRL+ENTER**: Start games when inactive
- **CTRL+ESC**: End games immediately (works in any game state)

### Bottom Status Bar

Real-time system monitoring with right-aligned status indicators:

- **Data Mode**: Shows "Data Mode" or "Practice Mode"
- **Camera Status**: Active/Inactive camera state
- **MediaPipe Status**: Ready/Loading pose detection system
- **FPS Counter**: Live frame rate from pose detection
- **Game Status**: Active/Inactive game state

### Main Canvas ([ThreeJSCanvas.svelte](src/components/ThreeJSCanvas.svelte))

- **Real-time Pose Visualization**: Color-coded skeletal overlay
  - Green: Head/face landmarks and connections
  - Red: Hand landmarks and connections
  - Blue: Leg/knee landmarks and connections
- **Interactive Targets**: Dynamically positioned game targets with collision detection
- **Mirrored Display**: Natural mirror-like interaction

### Side Panel ([WebcamPose.svelte](src/components/WebcamPose.svelte))

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

Implementation: [WebcamPose.svelte](src/components/WebcamPose.svelte#L188-L339)

### Motion Smoothing

Raw pose data is processed using a **Savitzky-Golay filter** to reduce noise while preserving motion dynamics:

- **Configurable Window Size**: Default 5-frame window (adjustable in settings)
- **Polynomial Order**: 2nd-order polynomial fitting
- **Temporal Coherence**: Maintains natural movement flow

Implementation: [smoothingService.ts](src/services/smoothingService.ts) and [+page.svelte](src/routes/+page.svelte)

### Game Mechanics

Target generation and collision detection system:

- **Adaptive Positioning**: Targets spawn in anatomically appropriate regions
  - Head targets: Upper 1/3 of screen (with 10% top margin for reachability)
  - Hand targets: Full capture area
  - Knee targets: Lower 50%-75% height range
- **Enhanced Collision**: Uses all hand landmarks (not just fingertips) for robust detection
- **Real-time Feedback**: Immediate visual and scoring response

Implementation: [ThreeJSCanvas.svelte](src/components/ThreeJSCanvas.svelte#L135-L290)

## Data Recording

### Dual Data Streams

The platform captures two synchronized datasets:

1. **Raw MediaPipe Data** ([recordingService.ts](src/services/recordingService.ts))
   - Unfiltered pose landmarks directly from MediaPipe
   - High temporal resolution for detailed analysis
   - Includes confidence scores and visibility flags

2. **Processed Game Data** ([+page.svelte](src/routes/+page.svelte) with [smoothingService.ts](src/services/smoothingService.ts))
   - Smoothed pose data used for visualization
   - Game state information and target interactions
   - Collision events with hit keypoint identification

### Exported Data Format

Each recording session generates:

- **CSV Files**: Timestamped pose and game data with comprehensive target tracking
- **Video Recording**: WebM format webcam capture
- **Synchronized Timestamps**: Unix timestamps + high-precision frame timing

CSV includes target data: `target_showing`, `target_id`, `target_type`, `target_x`, `target_y`, `target_status`

**Coordinate System**: All position data (pose landmarks and targets) use normalized coordinates (0-1 range) where:

- `x=0` is left edge, `x=1` is right edge
- `y=0` is top edge, `y=1` is bottom edge
- This ensures consistency between MediaPipe landmarks and target positions

Implementation: [recordingService.ts](src/services/recordingService.ts) and [+page.svelte](src/routes/+page.svelte)

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

```bash
src/
├── components/                 # UI Components
│   ├── WebcamPose.svelte      # MediaPipe integration and webcam
│   ├── ThreeJSCanvas.svelte   # Main game canvas and pose visualization
│   ├── SettingsModal.svelte   # Configuration interface
│   ├── ControlPanel.svelte    # Recording and playback controls
│   └── WebcamPanel.svelte     # Advanced webcam processing
├── services/                   # Business Logic
│   ├── mediaPipeService.ts    # Pose detection and drawing utilities
│   ├── recordingService.ts    # Data recording and file operations
│   └── smoothingService.ts    # Signal processing algorithms
├── stores/                     # State Management
│   ├── gameStore.ts           # Game state and scoring
│   └── appStore.ts            # App-wide settings and UI state
├── routes/                     # SvelteKit Routes
│   ├── +page.svelte           # Main application interface
│   └── page-old.svelte        # Legacy modular interface
└── lib/                        # Legacy (being phased out)
    └── index.ts               # Re-exports for compatibility
```

### Key Technologies

- **Frontend**: SvelteKit + TypeScript
- **Pose Detection**: MediaPipe Holistic (WebAssembly)
- **Signal Processing**: Custom Savitzky-Golay implementation
- **3D Graphics**: Three.js for pose visualization
- **Data Export**: Browser-native Blob API for file generation
- **State Management**: Svelte stores with reactive updates
- **Testing**: Vitest + Testing Library for comprehensive coverage
- **Architecture**: Service-oriented design with TypeScript

### Configuration Options

Accessible via Settings modal ([SettingsModal.svelte](src/components/SettingsModal.svelte)):

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

# Run unit tests only
npm run test:unit

# Run end-to-end tests
npm run test:e2e
```

### Testing

This project includes a comprehensive test suite covering services, stores, and components. For detailed information about our testing approach, coverage, and how to write new tests, see our **[Testing Documentation](TESTING.md)**.

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
- **Service-Oriented Architecture**: Clear separation of concerns with dedicated services
- **Comprehensive Testing**: Unit and component tests for reliability

### Architecture Benefits

- **Services**: Reusable business logic separated from UI components
- **Stores**: Centralized state management with reactive updates
- **Components**: Pure UI components with clear prop interfaces
- **Type Safety**: Full TypeScript coverage across all modules

### Key Extension Points

- **Target Types**: Add new target types in [ThreeJSCanvas.svelte](src/components/ThreeJSCanvas.svelte#L123-L133)
- **Export Formats**: Extend data structures in [recordingService.ts](src/services/recordingService.ts)
- **Pose Processing**: Add filtering algorithms in [smoothingService.ts](src/services/smoothingService.ts)
- **Game Logic**: Modify scoring and mechanics in [gameStore.ts](src/stores/gameStore.ts)
- **MediaPipe Integration**: Extend pose detection in [mediaPipeService.ts](src/services/mediaPipeService.ts)

## License

MIT License - see LICENSE file for details.
