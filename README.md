# DALL-E 3 Mask Hack

Experimental project to test pseudo-inpainting with DALL-E 3 using visual cues instead of traditional binary masks.

## The Problem

DALL-E 3 doesn't support:
- Binary masks for inpainting
- Image editing/variations
- Traditional inpainting workflows

## The Hack

Instead of binary masks, we use **visual differentiation**:

1. **Grayscale Method**: Convert the area to edit to grayscale, keep the rest in color
2. **Border Method**: Add a red border around the edit zone + grayscale

Then we prompt DALL-E 3 to "only modify the grayscale/marked areas".

```
┌─────────────────────────────────┐
│  COLORED AREA                   │
│  (keep unchanged)               │
│         ┌───────────────┐       │
│         │ GRAYSCALE     │       │
│         │ (edit this)   │       │
│         └───────────────┘       │
│                                 │
└─────────────────────────────────┘
```

## Installation

```bash
npm install
cp .env.example .env
# Add your OpenAI API key to .env
```

## Usage

### Quick Test (creates sample composites)

```bash
npm run test -- --composites-only
```

### Full Test with DALL-E 3

```bash
npm run test
```

### Custom Image + Mask

```bash
node index.js <image.png> <mask.png> "your edit prompt"
```

Example:
```bash
node index.js building.jpg mask.png "a modern glass facade with solar panels"
```

## Mask Format

- **White (255)** = Area to EDIT
- **Black (0)** = Area to KEEP

## Methods

### Method 1: Grayscale Zone
The edit area becomes grayscale, rest stays colored.

### Method 2: Red Border + Grayscale
Adds a visible red border around the edit zone for clearer visual separation.

## How It Works

1. Load original image and mask
2. Create composite with color/grayscale zones
3. Send to GPT-4o Vision for image analysis
4. Use analysis + edit prompt to generate with DALL-E 3
5. Compare results

## Expected Results

This is an **experiment**. Results may vary:

- ✅ DALL-E 3 might understand the visual cue and edit appropriately
- ⚠️ DALL-E 3 might regenerate the entire image
- ❌ DALL-E 3 might ignore the grayscale hint

## Alternatives (if this doesn't work)

For reliable inpainting, use:
- **DALL-E 2** (supports actual masks)
- **FLUX Fill Pro** (via Replicate)
- **Stable Diffusion Inpainting**
- **GPT-4o Image Generation** (gpt-image-1)

## License

MIT
