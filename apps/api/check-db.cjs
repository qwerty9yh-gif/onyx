// ONYX POS — Dependency Install & Start Helper
// This script installs dependencies if needed and starts the API server.

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const API_DIR = resolve(PROJECT_ROOT, 'apps/api');

// Ensure node_modules exist in project root
const rootNodeModules = resolve(PROJECT_ROOT, 'node_modules');
if (!existsSync(rootNodeModules)) {
  console.log('[ONYX] Root node_modules missing. Installing...');
  try {
    execSync('npm install --prefer-offline --no-audit --no-fund', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      timeout: 120000,
    });
    console.log('[ONYX] Root install complete.');
  } catch (err) {
    console.error('[ONYX] Root install failed:', err.message);
    process.exit(1);
  }
}

// Ensure API node_modules exist
const apiNodeModules = resolve(API_DIR, 'node_modules');
if (!existsSync(apiNodeModules)) {
  console.log('[ONYX] API node_modules missing. Installing in apps/api...');
  try {
    execSync('npm install --prefer-offline --no-audit --no-fund', {
      cwd: API_DIR,
      stdio: 'inherit',
      timeout: 120000,
    });
    console.log('[ONYX] API install complete.');
  } catch (err) {
    console.error('[ONYX] API install failed:', err.message);
    process.exit(1);
  }
}

// Now start the API server using tsx from root node_modules
const tsxPath = resolve(rootNodeModules, 'tsx/dist/cli.mjs');
if (!existsSync(tsxPath)) {
  console.error('[ONYX] tsx CLI not found at', tsxPath);
  process.exit(1);
}

console.log('[ONYX] Starting API server with tsx...');

import('child_process').then(({ spawn }) => {
  const child = spawn('node', [tsxPath, 'watch', 'src/index.ts'], {
    cwd: API_DIR,
    stdio: 'inherit',
    shell: false,
  });

  child.on('error', (err) => {
    console.error('[ONYX] Failed to start API:', err);
    process.exit(1);
  });

  child.on('exit', (code) => {
    console.log(`[ONYX] API server exited with code ${code}`);
    process.exit(code ?? 1);
  });
});
