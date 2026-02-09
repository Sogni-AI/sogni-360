#!/usr/bin/env node

/**
 * Sync Demo Videos to Cloudflare R2
 *
 * This script:
 * 1. Scans the ./demo folder for video files
 * 2. Uploads them to Cloudflare R2
 * 3. Updates src/constants/demoVideos.ts with the video URLs
 *
 * Prerequisites:
 * - rclone configured with 'sogni-r2' remote pointing to Cloudflare R2
 *
 * Usage:
 *   node scripts/sync-demo-videos.mjs
 *   node scripts/sync-demo-videos.mjs --dry-run  # Preview without uploading
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { basename, join, resolve } from 'path';

// Configuration
const CONFIG = {
  demoDir: './demo',
  r2Bucket: 'sogni-r2:safetensor-sogni-ai/sogni-360/demo-videos/',
  r2BaseUrl: 'https://cdn.sogni.ai/sogni-360/demo-videos/',
  outputFile: './src/constants/demoVideos.ts',
  supportedExtensions: ['.mp4', '.webm', '.mov']
};

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  console.error(`${colors.red}[ERROR] ${message}${colors.reset}`);
}

function logSuccess(message) {
  console.log(`${colors.green}[OK] ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}[INFO] ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}[WARN] ${message}${colors.reset}`);
}

/**
 * Check if rclone is available and configured
 */
function checkPrerequisites() {
  log('\nChecking prerequisites...', 'blue');

  // Check rclone exists
  try {
    execSync('which rclone', { stdio: 'ignore' });
  } catch {
    logError('rclone is not installed!');
    log('Please install it using: brew install rclone', 'yellow');
    process.exit(1);
  }
  logSuccess('rclone is installed');

  // Check sogni-r2 remote exists
  try {
    const remotes = execSync('rclone listremotes', { encoding: 'utf-8' });
    if (!remotes.includes('sogni-r2:')) {
      logError('rclone remote "sogni-r2" is not configured!');
      log('Please run: rclone config', 'yellow');
      process.exit(1);
    }
  } catch (error) {
    logError('Failed to check rclone remotes');
    process.exit(1);
  }
  logSuccess('sogni-r2 remote is configured');
}

/**
 * Get list of video files in demo directory
 */
function getVideoFiles() {
  const demoPath = resolve(CONFIG.demoDir);

  if (!existsSync(demoPath)) {
    logError(`Demo directory not found: ${demoPath}`);
    log('Please create the demo/ folder and add video files', 'yellow');
    process.exit(1);
  }

  const files = readdirSync(demoPath);
  const videos = files.filter(file => {
    const ext = file.toLowerCase().substring(file.lastIndexOf('.'));
    return CONFIG.supportedExtensions.includes(ext);
  });

  return videos.map(filename => {
    const filePath = join(demoPath, filename);
    const stats = statSync(filePath);
    return {
      filename,
      filePath,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size)
    };
  });
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get list of files already on R2 with their sizes
 */
function getR2Files() {
  try {
    const output = execSync(`rclone lsf "${CONFIG.r2Bucket}" --format "ps"`, {
      encoding: 'utf-8'
    });

    const files = new Map();
    output.trim().split('\n').forEach(line => {
      if (!line) return;
      // Format is "path;size"
      const [path, size] = line.split(';');
      if (path && size) {
        files.set(path.trim(), parseInt(size.trim(), 10));
      }
    });
    return files;
  } catch (error) {
    logWarning(`Could not list R2 files: ${error.message}`);
    return new Map();
  }
}

/**
 * Check if file needs upload (doesn't exist or different size)
 */
function needsUpload(filename, localSize, r2Files) {
  if (!r2Files.has(filename)) {
    return { needed: true, reason: 'new' };
  }

  const r2Size = r2Files.get(filename);
  if (r2Size !== localSize) {
    return { needed: true, reason: 'size-changed', r2Size };
  }

  return { needed: false };
}

/**
 * Upload a single video to R2
 */
function uploadToR2(filePath, dryRun = false) {
  const filename = basename(filePath);

  if (dryRun) {
    logInfo(`[DRY RUN] Would upload: ${filename}`);
    return true;
  }

  log(`Uploading: ${filename}`, 'blue');

  try {
    execSync(`rclone copy "${filePath}" "${CONFIG.r2Bucket}" --progress`, {
      stdio: 'inherit'
    });
    logSuccess(`Uploaded: ${filename}`);
    return true;
  } catch (error) {
    logError(`Failed to upload ${filename}: ${error.message}`);
    return false;
  }
}

/**
 * Generate the TypeScript constants file
 */
function generateConstantsFile(videos) {
  const videoEntries = videos.map(video => {
    // Extract a title from the filename
    const name = video.filename
      .replace(/\.[^.]+$/, '') // Remove extension
      .replace(/sogni-360-loop-?/gi, '') // Remove common prefix
      .replace(/-?\d{10,}/g, '') // Remove timestamps
      .replace(/[-_]+/g, ' ') // Replace dashes/underscores with spaces
      .trim();

    const title = name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ') || 'Demo Video';

    return {
      id: video.filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '-'),
      title,
      filename: video.filename,
      url: `${CONFIG.r2BaseUrl}${encodeURIComponent(video.filename)}`,
      size: video.size
    };
  });

  const tsContent = `/**
 * Demo Videos for Sogni 360
 *
 * These videos are automatically synced to R2 from the ./demo folder
 * using the sync-demo-videos.mjs script.
 *
 * Auto-generated on: ${new Date().toISOString()}
 */

export interface DemoVideo {
  id: string;
  title: string;
  filename: string;
  url: string;
  size: number;
}

export const DEMO_VIDEOS: DemoVideo[] = ${JSON.stringify(videoEntries, null, 2)};

/**
 * R2 base URL for demo videos
 */
export const DEMO_VIDEOS_BASE_URL = '${CONFIG.r2BaseUrl}';
`;

  const outputPath = resolve(CONFIG.outputFile);
  writeFileSync(outputPath, tsContent);
  logSuccess(`Generated: ${CONFIG.outputFile}`);

  return videoEntries;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  log('\nSogni 360 Demo Video Sync', 'green');
  log('='.repeat(40), 'green');

  if (dryRun) {
    logWarning('DRY RUN MODE - No files will be uploaded\n');
  }

  // Check prerequisites
  checkPrerequisites();

  // Get video files
  log('\nScanning demo folder...', 'blue');
  const videos = getVideoFiles();

  if (videos.length === 0) {
    logWarning('No video files found in demo/ folder');
    logInfo(`Supported formats: ${CONFIG.supportedExtensions.join(', ')}`);
    process.exit(0);
  }

  log(`\nFound ${videos.length} video(s):`, 'cyan');
  videos.forEach(v => {
    log(`  - ${v.filename} (${v.sizeFormatted})`, 'cyan');
  });

  // Check what's already on R2
  log('\nChecking R2 for existing files...', 'blue');
  const r2Files = getR2Files();
  log(`Found ${r2Files.size} file(s) already on R2`, 'cyan');

  // Determine which files need uploading
  const toUpload = [];
  const skipped = [];

  for (const video of videos) {
    const check = needsUpload(video.filename, video.size, r2Files);
    if (check.needed) {
      toUpload.push({ ...video, reason: check.reason, r2Size: check.r2Size });
    } else {
      skipped.push(video);
    }
  }

  // Report what will be skipped
  if (skipped.length > 0) {
    log(`\nSkipping ${skipped.length} file(s) already on R2:`, 'cyan');
    skipped.forEach(v => {
      log(`  - ${v.filename} (already exists, same size)`, 'cyan');
    });
  }

  // Upload only new/changed files
  const uploaded = [...skipped]; // Include skipped files in final list

  if (toUpload.length === 0) {
    log('\nNo new files to upload - all files already synced!', 'green');
  } else {
    log(`\nUploading ${toUpload.length} new/changed file(s) to R2...`, 'blue');

    for (const video of toUpload) {
      const reasonText = video.reason === 'new' ? '(new)' : `(size changed: ${formatBytes(video.r2Size)} -> ${video.sizeFormatted})`;
      log(`  ${video.filename} ${reasonText}`, 'cyan');

      const success = uploadToR2(video.filePath, dryRun);
      if (success) {
        uploaded.push(video);
      }
    }
  }

  if (uploaded.length === 0) {
    logError('No videos available (upload failed)');
    process.exit(1);
  }

  // Generate constants file
  log('\nGenerating constants file...', 'blue');
  const entries = generateConstantsFile(uploaded);

  // Summary
  log('\nSync Complete!', 'green');
  log('='.repeat(40), 'green');
  log(`Total videos: ${uploaded.length}`, 'cyan');
  log(`  - Already on R2: ${skipped.length}`, 'cyan');
  log(`  - Newly uploaded: ${toUpload.length}`, 'cyan');
  log(`Constants file: ${CONFIG.outputFile}`, 'cyan');
  log('\nVideo URLs:', 'cyan');
  entries.forEach(e => {
    log(`  ${e.title}: ${e.url}`, 'cyan');
  });

  if (dryRun) {
    log('\n[DRY RUN] No actual changes were made', 'yellow');
  }
}

main().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});
