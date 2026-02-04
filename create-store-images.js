const sharp = require('sharp');
const path = require('path');

async function createStoreImages() {
  const sizes = {
    xlarge: { width: 1000, height: 700 },
    large: { width: 500, height: 350 },
    small: { width: 250, height: 175 },
  };

  // Use the eco275-3d image (Genvex unit installed in a closet/utility room)
  const sourceImage = 'eco275-3d.webp';

  for (const [name, size] of Object.entries(sizes)) {
    const { width, height } = size;

    // Create the base image: crop source to 10:7 ratio and resize
    const base = await sharp(sourceImage)
      .resize(width, height, { fit: 'cover', position: 'left' })
      .png()
      .toBuffer();

    // Create a dark gradient overlay at the bottom for text readability
    const gradientHeight = Math.round(height * 0.38);
    const gradientSvg = `<svg width="${width}" height="${height}">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="40%" stop-color="rgba(0,0,0,0.55)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.8)" />
        </linearGradient>
      </defs>
      <rect x="0" y="${height - gradientHeight}" width="${width}" height="${gradientHeight}" fill="url(#grad)" />
    </svg>`;

    // Create the text overlay
    const titleSize = Math.round(width * 0.054);
    const subtitleSize = Math.round(width * 0.032);
    const titleY = height - Math.round(height * 0.16);
    const subtitleY = titleY + Math.round(titleSize * 1.5);

    const textSvg = `<svg width="${width}" height="${height}">
      <style>
        .title {
          fill: white;
          font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
          font-weight: 700;
          font-size: ${titleSize}px;
          letter-spacing: 0.5px;
        }
        .subtitle {
          fill: rgba(255,255,255,0.85);
          font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
          font-weight: 400;
          font-size: ${subtitleSize}px;
          letter-spacing: 0.3px;
        }
      </style>
      <text x="${Math.round(width * 0.06)}" y="${titleY}" class="title">Genvex Connect</text>
      <text x="${Math.round(width * 0.06)}" y="${subtitleY}" class="subtitle">Ventilation Control for Homey</text>
    </svg>`;

    const result = await sharp(base)
      .composite([
        { input: Buffer.from(gradientSvg), top: 0, left: 0 },
        { input: Buffer.from(textSvg), top: 0, left: 0 },
      ])
      .png()
      .toFile(path.join('assets', 'images', `${name}.png`));

    console.log(`Created ${name}.png: ${result.width}x${result.height}`);
  }

  console.log('Done! Store images created in assets/images/');
}

createStoreImages().catch(console.error);
