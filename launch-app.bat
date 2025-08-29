@echo off
title Play2Move - Motion Capture Game
echo.
echo ========================================
echo   Play2Move - Motion Capture Game
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: Node.js is not installed or not in PATH
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js detected
echo.

REM Check if dependencies are installed
if not exist node_modules (
    echo 📦 Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Error: Failed to install dependencies
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed
    echo.
)

REM Check if MediaPipe models are downloaded
if not exist static\models\holistic (
    echo 📥 Setting up MediaPipe models for offline use...
    call node scripts\setup-offline.js
    if %errorlevel% neq 0 (
        echo ⚠️ Warning: Failed to setup offline models, will use online CDN
    )
    echo.
)

echo 🚀 Starting Play2Move application...
echo.
echo   Local URL: http://localhost:5173
echo   Network URL will be shown below
echo.
echo   To stop the server: Press Ctrl+C
echo.

REM Start the development server and open browser
start "" http://localhost:5173
call npm run dev

pause