/**
 * DALL-E 3 Mask Hack - Pseudo-Inpainting Experiment
 *
 * Concept: Since DALL-E 3 doesn't support traditional masks,
 * we try a visual hack - converting the area to edit to grayscale
 * and asking DALL-E 3 to only modify the grayscale zone.
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
 * Creates a composite image with colored zone (keep) and grayscale zone (edit)
 * @param {string} imagePath - Path to original image
 * @param {string} maskPath - Path to mask (white = area to edit, black = keep)
 * @param {string} outputPath - Path for output composite image
 */
export async function createVisualMask(imagePath, maskPath, outputPath) {
  console.log('Creating visual mask composite...');

  // Load original image
  const originalBuffer = await fs.readFile(imagePath);
  const original = sharp(originalBuffer);
  const metadata = await original.metadata();

  // Load and process mask
  const maskBuffer = await fs.readFile(maskPath);
  const mask = sharp(maskBuffer)
    .resize(metadata.width, metadata.height)
    .grayscale();

  // Create grayscale version of original
  const grayscaleBuffer = await sharp(originalBuffer)
    .grayscale()
    .toBuffer();

  // Create the composite:
  // Where mask is white (255) -> show grayscale
  // Where mask is black (0) -> show original colors

  const maskProcessed = await mask.toBuffer();

  // Use sharp composite with mask
  const result = await sharp(originalBuffer)
    .composite([
      {
        input: grayscaleBuffer,
        blend: 'over',
        // We need to apply the mask to the grayscale layer
      }
    ])
    .toBuffer();

  // Alternative approach: pixel-by-pixel blending using raw buffers
  const originalRaw = await sharp(originalBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const grayscaleRaw = await sharp(grayscaleBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const maskRaw = await sharp(maskBuffer)
    .resize(metadata.width, metadata.height)
    .grayscale()
    .raw()
    .toBuffer();

  // Create output buffer
  const outputBuffer = Buffer.alloc(originalRaw.length);

  for (let i = 0; i < metadata.width * metadata.height; i++) {
    const maskValue = maskRaw[i] / 255; // 0-1 range
    const pixelIndex = i * 4; // RGBA

    // Blend: mask=1 (white) -> grayscale, mask=0 (black) -> original
    outputBuffer[pixelIndex] = Math.round(
      originalRaw[pixelIndex] * (1 - maskValue) + grayscaleRaw[pixelIndex] * maskValue
    );
    outputBuffer[pixelIndex + 1] = Math.round(
      originalRaw[pixelIndex + 1] * (1 - maskValue) + grayscaleRaw[pixelIndex + 1] * maskValue
    );
    outputBuffer[pixelIndex + 2] = Math.round(
      originalRaw[pixelIndex + 2] * (1 - maskValue) + grayscaleRaw[pixelIndex + 2] * maskValue
    );
    outputBuffer[pixelIndex + 3] = 255; // Full opacity
  }

  // Save result
  await sharp(outputBuffer, {
    raw: {
      width: metadata.width,
      height: metadata.height,
      channels: 4
    }
  })
    .png()
    .toFile(outputPath);

  console.log(`Visual mask created: ${outputPath}`);
  return outputPath;
}

/**
 * Sends composite image to DALL-E 3 with instructions to edit grayscale zone
 * @param {string} compositeImagePath - Path to the composite image
 * @param {string} editPrompt - What to change in the grayscale area
 * @param {string} outputDir - Directory for output images
 */
export async function editWithDalle3(compositeImagePath, editPrompt, outputDir = './output') {
  console.log('Sending to DALL-E 3...');

  // Read image and convert to base64
  const imageBuffer = await fs.readFile(compositeImagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/png';

  // Craft the prompt
  const fullPrompt = `Look at this image carefully. It has two distinct zones:
1. COLORED zones - these must remain EXACTLY as they are, do not modify them
2. GRAYSCALE/BLACK-AND-WHITE zones - these are the areas you should transform

Your task: Transform ONLY the grayscale/black-and-white areas into: ${editPrompt}

Keep the colored areas pixel-perfect identical. Only change the grayscale zones.
Maintain perfect visual continuity between the zones.`;

  console.log('Prompt:', fullPrompt);

  try {
    // Method 1: Use GPT-4 Vision to understand + DALL-E 3 to generate
    // First, analyze the image
    const analysis = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Describe this image in detail. Note which areas are in full color and which areas are in grayscale/black-and-white. Be very specific about the composition, objects, and their positions.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    });

    const imageDescription = analysis.choices[0].message.content;
    console.log('\nImage Analysis:', imageDescription);

    // Generate new image with DALL-E 3
    const generationPrompt = `Create an image based on this description: ${imageDescription}

IMPORTANT MODIFICATION: For the areas that were described as grayscale/black-and-white, replace them with: ${editPrompt}

Keep everything else exactly as described. Maintain the same composition, perspective, and style.`;

    console.log('\nGeneration prompt:', generationPrompt);

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: generationPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
      style: 'natural'
    });

    const imageUrl = response.data[0].url;
    const revisedPrompt = response.data[0].revised_prompt;

    console.log('\nRevised prompt by DALL-E:', revisedPrompt);
    console.log('Image URL:', imageUrl);

    // Download and save the result
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `result_${Date.now()}.png`);

    const imageResponse = await fetch(imageUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(arrayBuffer));

    console.log(`\nResult saved to: ${outputPath}`);

    return {
      outputPath,
      imageUrl,
      revisedPrompt,
      imageDescription
    };

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

/**
 * Alternative method: Add visible markers/borders to the edit zone
 */
export async function createMarkedMask(imagePath, maskPath, outputPath) {
  console.log('Creating marked mask with red border...');

  const originalBuffer = await fs.readFile(imagePath);
  const original = sharp(originalBuffer);
  const metadata = await original.metadata();

  const maskBuffer = await fs.readFile(maskPath);

  // Create edge detection on mask for red border
  const maskEdge = await sharp(maskBuffer)
    .resize(metadata.width, metadata.height)
    .grayscale()
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    })
    .threshold(50)
    .toBuffer();

  // Process buffers
  const originalRaw = await sharp(originalBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const grayscaleRaw = await sharp(originalBuffer)
    .grayscale()
    .ensureAlpha()
    .raw()
    .toBuffer();

  const maskRaw = await sharp(maskBuffer)
    .resize(metadata.width, metadata.height)
    .grayscale()
    .raw()
    .toBuffer();

  const edgeRaw = await sharp(maskEdge)
    .resize(metadata.width, metadata.height)
    .raw()
    .toBuffer();

  const outputBuffer = Buffer.alloc(originalRaw.length);

  for (let i = 0; i < metadata.width * metadata.height; i++) {
    const maskValue = maskRaw[i] / 255;
    const edgeValue = edgeRaw[i] / 255;
    const pixelIndex = i * 4;

    if (edgeValue > 0.5) {
      // Red border
      outputBuffer[pixelIndex] = 255;     // R
      outputBuffer[pixelIndex + 1] = 0;   // G
      outputBuffer[pixelIndex + 2] = 0;   // B
    } else {
      // Blend original/grayscale
      outputBuffer[pixelIndex] = Math.round(
        originalRaw[pixelIndex] * (1 - maskValue) + grayscaleRaw[pixelIndex] * maskValue
      );
      outputBuffer[pixelIndex + 1] = Math.round(
        originalRaw[pixelIndex + 1] * (1 - maskValue) + grayscaleRaw[pixelIndex + 1] * maskValue
      );
      outputBuffer[pixelIndex + 2] = Math.round(
        originalRaw[pixelIndex + 2] * (1 - maskValue) + grayscaleRaw[pixelIndex + 2] * maskValue
      );
    }
    outputBuffer[pixelIndex + 3] = 255;
  }

  await sharp(outputBuffer, {
    raw: {
      width: metadata.width,
      height: metadata.height,
      channels: 4
    }
  })
    .png()
    .toFile(outputPath);

  console.log(`Marked mask created: ${outputPath}`);
  return outputPath;
}

// CLI usage
if (process.argv[1].includes('index.js')) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
DALL-E 3 Mask Hack - Pseudo-Inpainting Experiment

Usage:
  node index.js <image> <mask> "<edit prompt>"

Example:
  node index.js photo.jpg mask.png "a modern glass building"

The mask should be:
  - White (255) = area to edit
  - Black (0) = area to keep
    `);
    process.exit(1);
  }

  const [imagePath, maskPath, editPrompt] = args;

  // Create composite
  const compositePath = './output/composite.png';
  await fs.mkdir('./output', { recursive: true });

  await createVisualMask(imagePath, maskPath, compositePath);

  // Send to DALL-E 3
  const result = await editWithDalle3(compositePath, editPrompt);

  console.log('\n=== EXPERIMENT COMPLETE ===');
  console.log('Composite image:', compositePath);
  console.log('Result image:', result.outputPath);
}
