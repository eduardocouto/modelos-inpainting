/**
 * Test script for GPT-Image 1 Inpainting
 * Creates sample test images and runs the experiment
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { inpaint, batchInpaint, createRectMask, createCircleMask } from './index.js';

const TEST_DIR = './test-images';
const OUTPUT_DIR = './output';

/**
 * Creates a simple test image (architectural scene)
 */
async function createTestImage() {
  console.log('Creating test image...');

  const width = 1024;
  const height = 1024;

  const pixels = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;

      // Sky gradient (top)
      if (y < 400) {
        const skyFactor = y / 400;
        pixels[i] = Math.floor(135 + (1 - skyFactor) * 50);     // R
        pixels[i + 1] = Math.floor(206 + (1 - skyFactor) * 30); // G
        pixels[i + 2] = 235;                                     // B
      }
      // Building (right side)
      else if (x > 500 && x < 800 && y > 200 && y < 850) {
        // Building base color
        pixels[i] = 180;
        pixels[i + 1] = 170;
        pixels[i + 2] = 160;

        // Windows
        const windowX = (x - 500) % 60;
        const windowY = (y - 200) % 100;
        if (windowX > 10 && windowX < 45 && windowY > 15 && windowY < 70) {
          pixels[i] = 100;
          pixels[i + 1] = 140;
          pixels[i + 2] = 180;
        }
      }
      // Ground/grass
      else if (y >= 850) {
        pixels[i] = 80;
        pixels[i + 1] = 140;
        pixels[i + 2] = 80;
      }
      // Background
      else {
        pixels[i] = 200;
        pixels[i + 1] = 210;
        pixels[i + 2] = 220;
      }
    }
  }

  await fs.mkdir(TEST_DIR, { recursive: true });

  await sharp(pixels, {
    raw: { width, height, channels: 3 }
  })
    .png()
    .toFile(path.join(TEST_DIR, 'test_building.png'));

  console.log('Test image created: test_building.png');
  return { width, height };
}

/**
 * Creates a test mask for the building area
 */
async function createBuildingMask(width, height) {
  console.log('Creating building mask...');

  const pixels = Buffer.alloc(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;

      // Mask the building area
      if (x > 480 && x < 820 && y > 180 && y < 870) {
        pixels[i] = 255; // White = edit
      } else {
        pixels[i] = 0;   // Black = keep
      }
    }
  }

  await sharp(pixels, {
    raw: { width, height, channels: 1 }
  })
    .png()
    .toFile(path.join(TEST_DIR, 'building_mask.png'));

  console.log('Building mask created: building_mask.png');
}

/**
 * Run simple inpainting test
 */
async function runSimpleTest() {
  console.log('\n=== GPT-Image 1 Simple Test ===\n');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Create test files
  const { width, height } = await createTestImage();
  await createBuildingMask(width, height);

  const imagePath = path.join(TEST_DIR, 'test_building.png');
  const maskPath = path.join(TEST_DIR, 'building_mask.png');

  // Check if API key is available
  if (!process.env.OPENAI_API_KEY) {
    console.log('\nTest images created successfully!');
    console.log('- Image:', imagePath);
    console.log('- Mask:', maskPath);
    console.log('\nTo run with GPT-Image 1, set OPENAI_API_KEY in .env file');
    return;
  }

  // Run inpainting
  const prompt = 'a modern glass skyscraper with reflective blue windows';
  const result = await inpaint(imagePath, maskPath, prompt);

  console.log('\n=== TEST COMPLETE ===');
  console.log('Original:', imagePath);
  console.log('Mask:', maskPath);
  console.log('Result:', result.outputPath);
}

/**
 * Run batch test with multiple prompts
 */
async function runBatchTest() {
  console.log('\n=== GPT-Image 1 Batch Test ===\n');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(TEST_DIR, { recursive: true });

  const { width, height } = await createTestImage();
  await createBuildingMask(width, height);

  const imagePath = path.join(TEST_DIR, 'test_building.png');
  const maskPath = path.join(TEST_DIR, 'building_mask.png');

  if (!process.env.OPENAI_API_KEY) {
    console.log('\nOPENAI_API_KEY not set. Create .env file with your API key.');
    return;
  }

  const prompts = [
    'a futuristic glass tower with LED lights',
    'a historic brick building with Victorian architecture',
    'a modern eco-friendly building covered in vertical gardens',
  ];

  const results = await batchInpaint(imagePath, maskPath, prompts);

  console.log('\n=== BATCH TEST RESULTS ===');
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.prompt}`);
    if (r.success) {
      console.log(`   Result: ${r.outputPath}`);
    } else {
      console.log(`   Error: ${r.error}`);
    }
  });
}

/**
 * Test mask creation utilities
 */
async function testMaskCreation() {
  console.log('\n=== Mask Creation Test ===\n');

  await fs.mkdir(TEST_DIR, { recursive: true });

  // Create rectangular mask
  await createRectMask(1024, 1024, { x: 200, y: 200, w: 400, h: 300 }, path.join(TEST_DIR, 'rect_mask.png'));

  // Create circular mask
  await createCircleMask(1024, 1024, { cx: 512, cy: 512, radius: 200 }, path.join(TEST_DIR, 'circle_mask.png'));

  console.log('\nMasks created in', TEST_DIR);
}

// Run based on args
const args = process.argv.slice(2);

if (args.includes('--batch')) {
  runBatchTest();
} else if (args.includes('--masks')) {
  testMaskCreation();
} else if (args.includes('--create-only')) {
  createTestImage().then(({ width, height }) => createBuildingMask(width, height));
} else {
  runSimpleTest();
}
