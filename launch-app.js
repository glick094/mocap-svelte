#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

console.log('');
console.log('========================================');
console.log('  Play2Move - Motion Capture Game');
console.log('========================================');
console.log('');

// Check if dependencies are installed
if (!fs.existsSync('node_modules')) {
  console.log('📦 Installing dependencies...');
  const install = spawn('npm', ['install'], { stdio: 'inherit', shell: true });
  
  install.on('close', (code) => {
    if (code !== 0) {
      console.error('❌ Error: Failed to install dependencies');
      process.exit(1);
    }
    console.log('✅ Dependencies installed');
    console.log('');
    checkModelsAndStart();
  });
} else {
  checkModelsAndStart();
}

function checkModelsAndStart() {
  // Check if MediaPipe models are downloaded
  const modelsPath = path.join('static', 'models', 'holistic');
  
  if (!fs.existsSync(modelsPath)) {
    console.log('📥 Setting up MediaPipe models for offline use...');
    const setupModels = spawn('node', ['scripts/setup-offline.js'], { stdio: 'inherit', shell: true });
    
    setupModels.on('close', (code) => {
      if (code !== 0) {
        console.log('⚠️ Warning: Failed to setup offline models, will use online CDN');
      }
      console.log('');
      startApp();
    });
  } else {
    startApp();
  }
}

function startApp() {
  console.log('🚀 Starting Play2Move application...');
  console.log('');
  console.log('   Local URL: http://localhost:5173');
  console.log('   Network URL will be shown below');
  console.log('');
  console.log('   To stop the server: Press Ctrl+C');
  console.log('');

  // Open browser after a delay
  setTimeout(() => {
    const url = 'http://localhost:5173';
    const platform = os.platform();
    
    let command;
    if (platform === 'darwin') {
      command = `open ${url}`;
    } else if (platform === 'win32') {
      command = `start ${url}`;
    } else {
      command = `xdg-open ${url}`;
    }
    
    exec(command, (error) => {
      if (error) {
        console.log(`Please open ${url} in your browser`);
      }
    });
  }, 3000);

  // Start the development server
  const dev = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true });
  
  dev.on('close', (code) => {
    console.log(`Server stopped with code ${code}`);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    dev.kill('SIGINT');
    process.exit(0);
  });
}