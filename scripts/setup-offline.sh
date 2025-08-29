#!/bin/bash

# MediaPipe Offline Setup Script
# This script downloads MediaPipe models and sets up the app for offline use

echo "🚀 Setting up MediaPipe models for offline use..."

# Create directories
mkdir -p static/models/holistic

# MediaPipe Holistic model files that need to be downloaded
MODELS=(
  "holistic.binarypb"
  "holistic.tflite"
  "holistic_solution_packed_assets_loader.js"
  "holistic_solution_packed_assets.data" 
  "holistic_solution_simd_wasm_bin.wasm"
  "holistic_solution_simd_wasm_bin.js"
)

# Base URL for MediaPipe models
BASE_URL="https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629"

echo "📥 Downloading MediaPipe model files..."

# Download each model file
for model in "${MODELS[@]}"; do
  echo "  Downloading $model..."
  if curl -L -f -o "static/models/holistic/$model" "$BASE_URL/$model"; then
    echo "  ✅ $model downloaded successfully"
  else
    echo "  ❌ Failed to download $model"
  fi
done

# Download package.json to check version info
echo "📄 Downloading package info..."
curl -L -f -o "static/models/holistic/package.json" "https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/package.json"

echo ""
echo "✅ MediaPipe models downloaded to static/models/holistic/"
echo ""
echo "Next steps:"
echo "1. Run npm install (if not already done)"
echo "2. Use the launch script to start the app offline"
echo ""