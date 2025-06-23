# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development server with HMR
npm run dev

# Production build for deployment
npm run build

# Preview production build locally
npm run preview

# Run unit tests
npm run test:unit

# Run end-to-end tests
npm run test:e2e

# Run all tests
npm run test

# TypeScript type checking
npm run check

# Lint and format code
npm run lint
npm run format
```

## Architecture Overview

This is a SvelteKit-based motion capture application that combines real-time pose tracking with 3D visualization. The app uses MediaPipe for computer vision and Three.js for 3D rendering.

### Key Components

- **`WebcamPose.svelte`** - Primary pose tracking component with MediaPipe integration
- **`WebcamPanel.svelte`** - Advanced webcam component with synchronized processing
- **`ThreeJSCanvas.svelte`** - 3D rendering component using Three.js
- **`+page.svelte`** - Current main interface (simplified single-purpose design)
- **`page-old.svelte`** - Legacy modular interface with advanced controls

### MediaPipe Integration

MediaPipe components are dynamically imported to avoid SSR issues:

```javascript
// Always use dynamic imports for MediaPipe
const { Holistic, Camera } = await import('@mediapipe/holistic');
```

The application uses CDN fallback for MediaPipe model files and includes performance optimization with configurable FPS and model complexity.

### Component Architecture

The current implementation favors a simplified approach with `WebcamPose.svelte` as the primary component. The legacy `page-old.svelte` demonstrates a more modular architecture with separate control panels and 3D visualization.

### Testing Setup

- Unit tests use Vitest with jsdom environment
- E2E tests use Playwright
- Browser APIs are mocked for component testing
- Tests are located in `src/routes/page.svelte.test.ts` and `e2e/` directory

### Build Configuration

- Uses static adapter for GitHub Pages deployment
- Base path configuration for production deployment
- TypeScript strict mode enabled
- Path alias `$lib` configured for clean imports

## Development Notes

- The app handles both MediaPipe Camera mode and manual canvas drawing
- Error handling includes retry logic for camera initialization
- Performance monitoring with frame counting and status indicators
- Responsive design with mobile-first approach and fullscreen capabilities
