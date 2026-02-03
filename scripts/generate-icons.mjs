#!/usr/bin/env node

/**
 * Generates premium app icons - sleek, expensive, powerful
 * Clean white/silver "360" on colorful Sogni ball
 */

import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const ICON_SIZES = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'mstile-144x144.png', size: 144 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
];

/**
 * Draw sleek, premium icon
 */
function drawIcon(ctx, size, logoImage) {
  const center = size / 2;
  const radius = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Draw base logo
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(logoImage, 0, 0, size, size);
  ctx.restore();

  // Subtle dark overlay for text legibility (very light)
  const darkOverlay = ctx.createRadialGradient(
    center, center, 0,
    center, center, radius * 0.7
  );
  darkOverlay.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  darkOverlay.addColorStop(0.6, 'rgba(0, 0, 0, 0.15)');
  darkOverlay.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = darkOverlay;
  ctx.fill();

  // "360" - sleek, thin, elegant
  const fontSize = size * 0.38;
  // Use thin/light weight for sleek look
  ctx.font = `300 ${fontSize}px "Helvetica Neue", "SF Pro Display", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const text = '360';
  const textY = center;

  // Subtle drop shadow for depth
  if (size >= 32) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = size * 0.04;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = size * 0.01;
  }

  // Clean white text with subtle silver gradient
  const silverGradient = ctx.createLinearGradient(
    center - fontSize, textY - fontSize * 0.4,
    center + fontSize, textY + fontSize * 0.4
  );
  silverGradient.addColorStop(0, '#ffffff');
  silverGradient.addColorStop(0.3, '#f8f8f8');
  silverGradient.addColorStop(0.5, '#ffffff');
  silverGradient.addColorStop(0.7, '#f0f0f0');
  silverGradient.addColorStop(1, '#ffffff');

  ctx.fillStyle = silverGradient;
  ctx.fillText(text, center, textY);

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Subtle top highlight on text for metallic feel
  if (size >= 64) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    const highlight = ctx.createLinearGradient(
      center, textY - fontSize * 0.35,
      center, textY + fontSize * 0.1
    );
    highlight.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    highlight.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
    highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = highlight;
    ctx.fillText(text, center, textY);
    ctx.restore();
  }
}

/**
 * Generate premium OG image
 */
function generateOGImage(ctx, width, height, logoImage) {
  // Rich dark background
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#08080c');
  bgGradient.addColorStop(0.5, '#0c0c12');
  bgGradient.addColorStop(1, '#08080c');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Very subtle ambient glow
  const glow = ctx.createRadialGradient(
    width * 0.35, height * 0.5, 0,
    width * 0.35, height * 0.5, 350
  );
  glow.addColorStop(0, 'rgba(100, 100, 120, 0.08)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Draw logo
  const logoSize = 320;
  const logoX = 140;
  const logoY = (height - logoSize) / 2;
  ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);

  // Text positioning
  const textX = logoX + logoSize + 70;
  const textCenterY = height / 2;

  // "Sogni" - clean, light weight
  ctx.font = '300 82px "Helvetica Neue", "SF Pro Display", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Sogni', textX, textCenterY - 50);

  // "360" - sleek with subtle metallic gradient
  ctx.font = '200 120px "Helvetica Neue", "SF Pro Display", Arial, sans-serif';

  const silverGradient = ctx.createLinearGradient(textX, textCenterY, textX + 200, textCenterY + 50);
  silverGradient.addColorStop(0, '#ffffff');
  silverGradient.addColorStop(0.5, '#e8e8e8');
  silverGradient.addColorStop(1, '#ffffff');

  ctx.fillStyle = silverGradient;
  ctx.fillText('360', textX, textCenterY + 55);

  // Tagline - subtle
  ctx.font = '300 24px "Helvetica Neue", "SF Pro Display", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText('AI-Powered 360° Orbital Video Generator', textX, textCenterY + 130);

  // Minimal accent line
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(textX, textCenterY + 155, 280, 1);
}

/**
 * Create ICO file
 */
function createICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + (images.length * 16);
  const entries = [];
  const imageData = [];

  for (const { size, buffer } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);

    entries.push(entry);
    imageData.push(buffer);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...imageData]);
}

async function main() {
  console.log('Loading Sogni ball logo...');
  const logoPath = path.join(publicDir, 'logo.png');
  const logoImage = await loadImage(logoPath);

  console.log('Generating sleek premium icons...');

  for (const { name, size } of ICON_SIZES) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawIcon(ctx, size, logoImage);
    fs.writeFileSync(path.join(publicDir, name), canvas.toBuffer('image/png'));
    console.log(`  ✓ ${name}`);
  }

  console.log('Generating favicon.ico...');
  const icoImages = [];
  for (const size of [16, 32, 48]) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawIcon(ctx, size, logoImage);
    icoImages.push({ size, buffer: canvas.toBuffer('image/png') });
  }
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createICO(icoImages));
  console.log('  ✓ favicon.ico');

  console.log('Generating og-image.png...');
  const ogCanvas = createCanvas(1200, 630);
  generateOGImage(ogCanvas.getContext('2d'), 1200, 630, logoImage);
  fs.writeFileSync(path.join(publicDir, 'og-image.png'), ogCanvas.toBuffer('image/png'));
  console.log('  ✓ og-image.png');

  console.log('\n✨ Done');
}

main().catch(console.error);
