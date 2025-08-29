#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Setting up MediaPipe models for offline use...');

// Create directories
const modelsDir = path.join(__dirname, '..', 'static', 'models', 'holistic');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// MediaPipe Holistic model files that need to be downloaded
const models = [
  'holistic.binarypb',
  'holistic.tflite', 
  'holistic_solution_packed_assets_loader.js',
  'holistic_solution_packed_assets.data',
  'holistic_solution_simd_wasm_bin.wasm',
  'holistic_solution_simd_wasm_bin.js'
];

// Base URL for MediaPipe models
const baseUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629';

console.log('📥 Downloading MediaPipe model files...');

// Download function
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        file.close();
        fs.unlinkSync(filepath);
        downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlinkSync(filepath);
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(filepath);
      reject(err);
    });
  });
}

// Download all models sequentially
async function downloadModels() {
  let successCount = 0;
  let failCount = 0;

  for (const model of models) {
    const url = `${baseUrl}/${model}`;
    const filepath = path.join(modelsDir, model);
    
    try {
      console.log(`  Downloading ${model}...`);
      await downloadFile(url, filepath);
      console.log(`  ✅ ${model} downloaded successfully`);
      successCount++;
    } catch (error) {
      console.log(`  ❌ Failed to download ${model}: ${error.message}`);
      failCount++;
    }
  }

  // Download package.json for version info
  try {
    console.log('📄 Downloading package info...');
    await downloadFile(`${baseUrl}/package.json`, path.join(modelsDir, 'package.json'));
    console.log('  ✅ Package info downloaded');
    successCount++;
  } catch (error) {
    console.log(`  ❌ Failed to download package.json: ${error.message}`);
    failCount++;
  }

  console.log('');
  console.log(`✅ Setup complete! ${successCount} files downloaded, ${failCount} failed`);
  console.log(`📁 MediaPipe models saved to: ${modelsDir}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Run npm install (if not already done)');
  console.log('2. Use the launch script to start the app offline');
  console.log('');
}

downloadModels().catch(console.error);