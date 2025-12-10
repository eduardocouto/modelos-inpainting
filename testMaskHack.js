/**
 * Test script for DALL-E 3 Mask Hack
 * Creates sample test images and runs the experiment
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { createVisualMask, createMarkedMask, editWithDalle3 } from './index.js';

const TEST_DIR = './test-images';
const OUTPUT_DIR = './output';

/**
 * Creates a simple test image (colorful gradient with shapes)
 */
async function createTestImage() {
  console.log('Creating test image...');

  const width = 1024;
  const height = 1024;

  // Create a colorful test image using raw pixel manipulation
  const pixels = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;

      // Create gradient background
      pixels[i] = Math.floor((x / width) * 255);     // R
      pixels[i + 1] = Math.floor((y / height) * 255); // G
      pixels[i + 2] = 150;                            // B

      // Add a "building" shape on the right
      if (x > 600 && x < 800 && y > 300 && y < 800) {
        pixels[i] = 100;
        pixels[i + 1] = 100;
        pixels[i + 2] = 100;
      }

      // Add windows to building
      if (x > 600 && x < 800 && y > 300 && y < 800) {
        const windowX = (x - 600) % 50;
        const windowY = (y - 300) % 80;
        if (windowX > 10 && windowX < 40 && windowY > 10 && windowY < 60) {
          pixels[i] = 200;
          pixels[i + 1] = 220;
          pixels[i + 2] = 255;
        }
      }

      // Add ground
      if (y > 800) {
        pixels[i] = 80;
        pixels[i + 1] = 120;
        pixels[i + 2] = 80;
      }

      // Add sky gradient
      if (y < 200) {
        pixels[i] = 135 + Math.floor((1 - y / 200) * 50);
        pixels[i + 1] = 206 + Math.floor((1 - y / 200) * 30);
        pixels[i + 2] = 235;
      }
    }
  }

  await fs.mkdir(TEST_DIR, { recursive: true });

  await sharp(pixels, {
    raw: { width, height, channels: 3 }
  })
    .png()
    .toFile(path.join(TEST_DIR, 'test_scene.png'));

  console.log('Test image created: test_scene.png');
}

/**
 * Creates a test mask (white = area to edit)
 */
async function createTestMask() {
  console.log('Creating test mask...');

  const width = 1024;
  const height = 1024;

  const pixels = Buffer.alloc(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;

      // Mask the building area (white = edit, black = keep)
      if (x > 580 && x < 820 && y > 280 && y < 820) {
        pixels[i] = 255; // White - edit this area
      } else {
        pixels[i] = 0;   // Black - keep this area
      }
    }
  }

  await sharp(pixels, {
    raw: { width, height, channels: 1 }
  })
    .png()
    .toFile(path.join(TEST_DIR, 'test_mask.png'));

  console.log('Test mask created: test_mask.png');
}

/**
 * Run the full experiment
 */
async function runExperiment() {
  console.log('\n=== DALL-E 3 MASK HACK EXPERIMENT ===\n');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Create test files
  await createTestImage();
  await createTestMask();

  const imagePath = path.join(TEST_DIR, 'test_scene.png');
  const maskPath = path.join(TEST_DIR, 'test_mask.png');

  // Method 1: Grayscale mask
  console.log('\n--- Method 1: Grayscale Zone ---');
  const compositePath1 = path.join(OUTPUT_DIR, 'composite_grayscale.png');
  await createVisualMask(imagePath, maskPath, compositePath1);

  // Method 2: Marked with red border
  console.log('\n--- Method 2: Red Border Marker ---');
  const compositePath2 = path.join(OUTPUT_DIR, 'composite_marked.png');
  await createMarkedMask(imagePath, maskPath, compositePath2);

  console.log('\n--- Composite images created! ---');
  console.log('1. Grayscale method:', compositePath1);
  console.log('2. Red border method:', compositePath2);

  // Check if API key is available
  if (!process.env.OPENAI_API_KEY) {
    console.log('\n⚠️  OPENAI_API_KEY not set!');
    console.log('To test with DALL-E 3, create a .env file with your API key.');
    console.log('See .env.example for format.');
    console.log('\nComposite images have been created for manual testing.');
    return;
  }

  // Run DALL-E 3 test
  console.log('\n--- Sending to DALL-E 3 ---');
  const editPrompt = 'a futuristic glass skyscraper with blue LED lights';

  try {
    const result = await editWithDalle3(compositePath1, editPrompt, OUTPUT_DIR);
    console.log('\n=== EXPERIMENT RESULTS ===');
    console.log('Original + Mask composite:', compositePath1);
    console.log('DALL-E 3 result:', result.outputPath);
    console.log('\nCompare the images to evaluate if the hack worked!');
  } catch (error) {
    console.error('DALL-E 3 error:', error.message);
  }
}

// Alternative: just create composites without API call
async function createCompositesOnly() {
  console.log('\n=== Creating Test Composites (No API) ===\n');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(TEST_DIR, { recursive: true });

  await createTestImage();
  await createTestMask();

  const imagePath = path.join(TEST_DIR, 'test_scene.png');
  const maskPath = path.join(TEST_DIR, 'test_mask.png');

  await createVisualMask(
    imagePath,
    maskPath,
    path.join(OUTPUT_DIR, 'composite_grayscale.png')
  );

  await createMarkedMask(
    imagePath,
    maskPath,
    path.join(OUTPUT_DIR, 'composite_redmarker.png')
  );

  console.log('\nDone! Check the output folder.');
}

// Run based on args
const args = process.argv.slice(2);
if (args.includes('--composites-only')) {
  createCompositesOnly();
} else {
  runExperiment();
}
