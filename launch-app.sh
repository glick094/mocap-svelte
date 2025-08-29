#!/bin/bash

echo ""
echo "========================================"
echo "  Play2Move - Motion Capture Game"  
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed or not in PATH"
    echo ""
    echo "Please install Node.js from: https://nodejs.org/"
    echo ""
    exit 1
fi

echo "✅ Node.js detected ($(node --version))"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed"
    echo ""
fi

# Check if MediaPipe models are downloaded
if [ ! -d "static/models/holistic" ]; then
    echo "📥 Setting up MediaPipe models for offline use..."
    node scripts/setup-offline.js
    if [ $? -ne 0 ]; then
        echo "⚠️ Warning: Failed to setup offline models, will use online CDN"
    fi
    echo ""
fi

echo "🚀 Starting Play2Move application..."
echo ""
echo "   Local URL: http://localhost:5173"
echo "   Network URL will be shown below"
echo ""
echo "   To stop the server: Press Ctrl+C"
echo ""

# Function to open browser
open_browser() {
    sleep 3
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:5173
    elif command -v open &> /dev/null; then
        open http://localhost:5173
    elif command -v start &> /dev/null; then
        start http://localhost:5173
    else
        echo "Please open http://localhost:5173 in your browser"
    fi
}

# Start browser in background
open_browser &

# Start the development server
npm run dev