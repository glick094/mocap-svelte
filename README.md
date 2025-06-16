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
2. **Begin Game**: Click "🎮 Start Game" to spawn targets
3. **Hit Targets**: Move your body to hit colored targets:
   - 🔴 **Red targets**: Hit with hands
   - 🟢 **Green targets**: Hit with head/face
   - 🔵 **Blue targets**: Hit with knees
4. **Record Data**: Click "🔴 Record Data" to capture motion and game data
5. **View Progress**: Check your score breakdown in the side panel

## Game Window Overview

The interface consists of three main areas:

### Header Controls

- **Camera Toggle**: Enable/disable webcam feed
- **Recording**: Start/stop data capture (exports CSV + video)
- **Game Controls**: Start/stop target game with live score display
- **Settings**: Configure capture quality, smoothing, and canvas dimensions

### Main Canvas ([ThreeJSCanvas.svelte](src/components/ThreeJSCanvas.svelte))

- **Real-time Pose Visualization**: Color-coded skeletal overlay
  - Green: Head/face landmarks and connections
  - Red: Hand landmarks and connections
  - Blue: Leg/knee landmarks and connections
- **Interactive Targets**: Dynamically positioned game targets with collision detection
- **Mirrored Display**: Natural mirror-like interaction

### Side Panel ([WebcamPose.svelte](src/components/WebcamPose.svelte))

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
