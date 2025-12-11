/**
 * GPT-Image 1 - Native Inpainting
 *
 * Uses OpenAI's gpt-image-1 model with native mask support.
 * The mask defines which areas to edit (transparent = edit, opaque = keep).
 */

import OpenAI from 'openai';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables
import { config } from 'dotenv';
config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Converts a black/white mask to RGBA with transparency
 * GPT-Image 1 expects: transparent areas = edit, opaque areas = keep
 *
 * @param {string} maskPath - Path to mask (white = area to edit, black = keep)
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @returns {Buffer} - PNG buffer with alpha channel
 */
export async function convertMaskToAlpha(maskPath, width, height) {
  console.log('Converting mask to alpha channel...');

  const maskBuffer = await fs.readFile(maskPath);

  // Get mask as grayscale raw pixels
  const maskRaw = await sharp(maskBuffer)
    .resize(width, height)
    .grayscale()
    .raw()
    .toBuffer();

  // Create RGBA buffer
  const rgbaBuffer = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const maskValue = maskRaw[i];
    const pixelIndex = i * 4;

    // White in mask (255) = transparent (area to edit)
    // Black in mask (0) = opaque (area to keep)
    rgbaBuffer[pixelIndex] = 0;     // R
    rgbaBuffer[pixelIndex + 1] = 0; // G
    rgbaBuffer[pixelIndex + 2] = 0; // B
    rgbaBuffer[pixelIndex + 3] = 255 - maskValue; // Alpha: inverted
  }

  const pngBuffer = await sharp(rgbaBuffer, {
    raw: { width, height, channels: 4 }
  })
    .png()
    .toBuffer();

  return pngBuffer;
}

/**
 * Prepares image for GPT-Image 1 (ensures PNG with alpha)
 *
 * @param {string} imagePath - Path to original image
 * @returns {Object} - { buffer, width, height }
 */
export async function prepareImage(imagePath) {
  console.log('Preparing image...');

  const imageBuffer = await fs.readFile(imagePath);
  const metadata = await sharp(imageBuffer).metadata();

  // Ensure image is PNG with alpha channel
  const pngBuffer = await sharp(imageBuffer)
    .ensureAlpha()
    .png()
    .toBuffer();

  return {
    buffer: pngBuffer,
    width: metadata.width,
    height: metadata.height
  };
}

/**
 * Performs inpainting using GPT-Image 1
 *
 * @param {string} imagePath - Path to original image
 * @param {string} maskPath - Path to mask (white = edit, black = keep)
 * @param {string} prompt - What to generate in the masked area
 * @param {Object} options - Additional options
 * @returns {Object} - Result with output path and metadata
 */
export async function inpaint(imagePath, maskPath, prompt, options = {}) {
  const {
    outputDir = './output',
    size = 'auto', // auto, 1024x1024, 1536x1024, 1024x1536
    quality = 'high', // low, medium, high
  } = options;

  console.log('\n=== GPT-Image 1 Inpainting ===');
  console.log('Image:', imagePath);
  console.log('Mask:', maskPath);
  console.log('Prompt:', prompt);

  // Prepare image
  const { buffer: imageBuffer, width, height } = await prepareImage(imagePath);

  // Convert mask to alpha channel format
  const maskBuffer = await convertMaskToAlpha(maskPath, width, height);

  // Save prepared files for debugging
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'prepared_image.png'), imageBuffer);
  await fs.writeFile(path.join(outputDir, 'prepared_mask.png'), maskBuffer);

  console.log('\nSending to GPT-Image 1...');

  try {
    // Create File objects for the API
    const imageFile = new File([imageBuffer], 'image.png', { type: 'image/png' });
    const maskFile = new File([maskBuffer], 'mask.png', { type: 'image/png' });

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      mask: maskFile,
      prompt: prompt,
      n: 1,
      size: size === 'auto' ? undefined : size,
      quality: quality,
    });

    // Handle response - can be URL or base64
    const imageData = response.data[0];
    let resultBuffer;

    if (imageData.url) {
      console.log('Downloading result from URL...');
      const imageResponse = await fetch(imageData.url);
      const arrayBuffer = await imageResponse.arrayBuffer();
      resultBuffer = Buffer.from(arrayBuffer);
    } else if (imageData.b64_json) {
      console.log('Decoding base64 result...');
      resultBuffer = Buffer.from(imageData.b64_json, 'base64');
    }

    // Save result
    const timestamp = Date.now();
    const outputPath = path.join(outputDir, `inpaint_result_${timestamp}.png`);
    await fs.writeFile(outputPath, resultBuffer);

    console.log(`\nResult saved to: ${outputPath}`);

    return {
      outputPath,
      revisedPrompt: imageData.revised_prompt,
      width,
      height
    };

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Batch inpainting - multiple prompts on same image/mask
 *
 * @param {string} imagePath - Path to original image
 * @param {string} maskPath - Path to mask
 * @param {string[]} prompts - Array of prompts to try
 * @param {Object} options - Additional options
 * @returns {Object[]} - Array of results
 */
export async function batchInpaint(imagePath, maskPath, prompts, options = {}) {
  console.log(`\n=== Batch Inpainting (${prompts.length} variations) ===`);

  const results = [];

  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n--- Variation ${i + 1}/${prompts.length} ---`);
    try {
      const result = await inpaint(imagePath, maskPath, prompts[i], {
        ...options,
        outputDir: options.outputDir || './output'
      });
      results.push({ prompt: prompts[i], ...result, success: true });
    } catch (error) {
      results.push({ prompt: prompts[i], error: error.message, success: false });
    }
  }

  return results;
}

/**
 * Creates a simple rectangular mask
 *
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} rect - { x, y, w, h } rectangle to mask
 * @param {string} outputPath - Path to save mask
 */
export async function createRectMask(width, height, rect, outputPath) {
  console.log('Creating rectangular mask...');

  const pixels = Buffer.alloc(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;

      if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) {
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
    .toFile(outputPath);

  console.log(`Mask saved to: ${outputPath}`);
  return outputPath;
}

/**
 * Creates a circular mask
 *
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} circle - { cx, cy, radius } circle to mask
 * @param {string} outputPath - Path to save mask
 */
export async function createCircleMask(width, height, circle, outputPath) {
  console.log('Creating circular mask...');

  const pixels = Buffer.alloc(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const dist = Math.sqrt((x - circle.cx) ** 2 + (y - circle.cy) ** 2);

      if (dist <= circle.radius) {
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
    .toFile(outputPath);

  console.log(`Mask saved to: ${outputPath}`);
  return outputPath;
}

// CLI usage
const isMainModule = process.argv[1]?.includes('index.js') || process.argv[1]?.includes('index.mjs');

if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
GPT-Image 1 - Native Inpainting

Usage:
  node index.js <image> <mask> "<prompt>" [options]

Arguments:
  image    - Path to the original image (PNG, JPG, etc.)
  mask     - Path to the mask image (white = edit, black = keep)
  prompt   - What to generate in the masked area

Options:
  --size=<size>      - Output size: 1024x1024, 1536x1024, 1024x1536 (default: auto)
  --quality=<q>      - Quality: low, medium, high (default: high)
  --output=<dir>     - Output directory (default: ./output)

Example:
  node index.js photo.jpg mask.png "a beautiful garden with flowers"
  node index.js building.png roof_mask.png "solar panels on the roof" --quality=high

Mask format:
  - White (255) = area to EDIT/REPLACE
  - Black (0) = area to KEEP unchanged
    `);
    process.exit(1);
  }

  // Parse arguments
  const imagePath = args[0];
  const maskPath = args[1];
  const prompt = args[2];

  const options = {};
  for (const arg of args.slice(3)) {
    if (arg.startsWith('--size=')) options.size = arg.split('=')[1];
    if (arg.startsWith('--quality=')) options.quality = arg.split('=')[1];
    if (arg.startsWith('--output=')) options.outputDir = arg.split('=')[1];
  }

  // Run inpainting
  try {
    const result = await inpaint(imagePath, maskPath, prompt, options);

    console.log('\n=== INPAINTING COMPLETE ===');
    console.log('Input image:', imagePath);
    console.log('Mask:', maskPath);
    console.log('Result:', result.outputPath);
    if (result.revisedPrompt) {
      console.log('Revised prompt:', result.revisedPrompt);
    }
  } catch (error) {
    console.error('\nFailed:', error.message);
    process.exit(1);
  }
}
