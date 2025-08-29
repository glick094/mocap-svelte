# Offline Deployment Guide

This guide explains how to run the Play2Move application completely offline for data collection in environments without internet access.

## Quick Start

### Method 1: Desktop Launcher (Recommended)

1. **Setup offline models** (one-time setup):
   ```bash
   npm run setup-offline
   ```

2. **Launch the app** using the desktop launcher:
   - **Windows**: Double-click `launch-app.bat`
   - **Mac/Linux**: Double-click `launch-app.sh` (or run `./launch-app.sh`)
   - **Cross-platform**: Run `node launch-app.js`

The launcher will:
- ✅ Check for Node.js and dependencies
- 📥 Download MediaPipe models if needed
- 🚀 Start the development server
- 🌐 Open the app in your browser automatically

### Method 2: Manual Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Download MediaPipe models for offline use**:
   ```bash
   npm run setup-offline
   # OR
   node scripts/setup-offline.js
   ```

3. **Start the application**:
   ```bash
   npm run dev
   ```

4. **Open browser** to `http://localhost:5173`

## How It Works

### Offline Model System

The app uses an intelligent model loading system:

1. **Local First**: Checks for MediaPipe models in `static/models/holistic/`
2. **CDN Fallback**: If local models aren't found, uses online CDN
3. **Automatic Detection**: No configuration needed - works online and offline

### Downloaded Files

The offline setup downloads these MediaPipe model files (~50MB total):
- `holistic.binarypb` - Core pose detection model
- `holistic.tflite` - TensorFlow Lite model
- `holistic_solution_*.js` - JavaScript runtime
- `holistic_solution_*.wasm` - WebAssembly binaries
- `holistic_solution_*.data` - Model data files

### Directory Structure

```
static/
├── models/
│   └── holistic/
│       ├── holistic.binarypb
│       ├── holistic.tflite
│       ├── holistic_solution_packed_assets_loader.js
│       ├── holistic_solution_packed_assets.data
│       ├── holistic_solution_simd_wasm_bin.wasm
│       ├── holistic_solution_simd_wasm_bin.js
│       └── package.json
└── (other static assets)
```

## Desktop Shortcuts

### Windows Desktop Shortcut

1. Right-click on Desktop → New → Shortcut
2. Location: `"C:\path\to\mocap-svelte\launch-app.bat"`
3. Name: "Play2Move - Motion Capture Game"
4. Right-click shortcut → Properties → Change Icon (optional)

### Mac Desktop Shortcut

1. Open Automator → New → Application
2. Add "Run Shell Script" action
3. Script: `/path/to/mocap-svelte/launch-app.sh`
4. Save as "Play2Move" to Desktop

### Linux Desktop Shortcut

Create `Play2Move.desktop` file:
```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=Play2Move
Comment=Motion Capture Game
Exec=/path/to/mocap-svelte/launch-app.sh
Icon=/path/to/mocap-svelte/static/favicon.png
Terminal=false
Categories=Game;Science;
```

## Requirements

### System Requirements
- **Node.js 18+** (Download from [nodejs.org](https://nodejs.org/))
- **Modern web browser** (Chrome, Firefox, Safari, Edge)
- **Webcam access** (USB or built-in camera)
- **~100MB disk space** (for models and dependencies)

### Network Requirements
- **Setup phase**: Internet required to download models (one-time)
- **Runtime**: No internet required once models are downloaded

## Troubleshooting

### Common Issues

**"Node.js not found"**:
- Install Node.js from [nodejs.org](https://nodejs.org/)
- Restart terminal/command prompt after installation

**"Models failed to download"**:
- Check internet connection during setup
- Try running `npm run setup-offline` manually
- App will still work with online CDN fallback

**"Camera not working"**:
- Ensure webcam is connected and not used by other apps
- Grant browser permission to access camera
- Use HTTPS in production (not needed for localhost)

**"App won't start"**:
- Check if port 5173 is available
- Close other instances of the app
- Try `npm run dev` manually to see error details

### Advanced Troubleshooting

**Clear cache and restart**:
```bash
npm run clean    # Clear build cache
npm install      # Reinstall dependencies
npm run setup-offline  # Re-download models
```

**Check model integrity**:
```bash
ls -la static/models/holistic/
# Should show ~6-7 files totaling ~50MB
```

**Manual model download**:
If automatic download fails, manually download from:
`https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/`

## Deployment Tips

### For Research Labs

1. **Initial Setup**: Run setup on one computer with internet
2. **Copy to Others**: Copy entire project folder to offline computers
3. **Desktop Shortcuts**: Create desktop shortcuts for easy access
4. **Documentation**: Print this guide for offline reference

### For Field Studies

1. **Pre-download**: Run `npm run setup-offline` before going offline
2. **Portable Setup**: Copy project to USB drive or laptop
3. **Battery Backup**: Ensure adequate power for data collection
4. **Storage**: Verify sufficient disk space for recorded data

### File Sizes

- **Project**: ~200MB (with node_modules and models)
- **Per Session**: ~50-100MB (CSV + video files)
- **USB Drive**: 8GB+ recommended for multiple sessions

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run setup-offline` | Download MediaPipe models for offline use |
| `npm run dev` | Start development server |
| `npm run build` | Build production version |
| `npm run preview` | Preview production build |
| `./launch-app.sh` | Launch app (Mac/Linux) |
| `launch-app.bat` | Launch app (Windows) |
| `node launch-app.js` | Launch app (Cross-platform) |

## Security Notes

- App runs locally on `localhost:5173`
- No data sent to external servers
- All processing happens on device
- Recorded files saved locally only
- Safe for sensitive research data

## Need Help?

1. Check this documentation first
2. Verify system requirements
3. Try manual setup steps
4. Contact technical support with error details