#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { createCanvas } = require('canvas');

// Icon sizes for PWA
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];
const additionalSizes = [16, 32, 180]; // favicon and apple-touch-icon

class IconGenerator {
    constructor() {
        this.iconDir = path.join(__dirname, '../frontend/public/icons');
        this.baseColor = '#2563eb'; // Primary blue color
        this.secondaryColor = '#06b6d4'; // Accent color
    }

    async ensureIconDirectory() {
        try {
            await fs.mkdir(this.iconDir, { recursive: true });
        } catch (error) {
            console.error('Error creating icon directory:', error);
        }
    }

    drawVibrateIcon(ctx, size) {
        const center = size / 2;
        const scale = size / 512;

        // Clear the canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // Background circle
        ctx.beginPath();
        ctx.arc(center, center, center * 0.9, 0, 2 * Math.PI);
        ctx.fillStyle = this.baseColor;
        ctx.fill();

        // Wave lines representing vibration
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8 * scale;
        ctx.lineCap = 'round';

        // Three wave lines
        for (let i = 0; i < 3; i++) {
            const y = center - (30 * scale) + (i * 30 * scale);
            const amplitude = 20 * scale;
            const frequency = 0.02 / scale;

            ctx.beginPath();
            for (let x = center - (100 * scale); x <= center + (100 * scale); x += 2) {
                const waveY = y + Math.sin(x * frequency) * amplitude;
                if (x === center - (100 * scale)) {
                    ctx.moveTo(x, waveY);
                } else {
                    ctx.lineTo(x, waveY);
                }
            }
            ctx.stroke();
        }

        // Central monitoring device
        const deviceSize = 40 * scale;
        ctx.fillStyle = this.secondaryColor;
        ctx.fillRect(center - deviceSize/2, center - deviceSize/2, deviceSize, deviceSize);
        
        // Device screen
        const screenSize = 20 * scale;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(center - screenSize/2, center - screenSize/2, screenSize, screenSize);
        
        // Small indicator dots on screen
        ctx.fillStyle = this.baseColor;
        for (let i = 0; i < 3; i++) {
            const dotX = center - (8 * scale) + (i * 8 * scale);
            const dotY = center - (2 * scale);
            ctx.beginPath();
            ctx.arc(dotX, dotY, 2 * scale, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    async generateIcon(size) {
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');

        this.drawVibrateIcon(ctx, size);

        const buffer = canvas.toBuffer('image/png');
        const filename = `icon-${size}x${size}.png`;
        const filepath = path.join(this.iconDir, filename);

        await fs.writeFile(filepath, buffer);
        console.log(`✓ Generated ${filename}`);
    }

    async generateFavicon() {
        // Generate 16x16 and 32x32 favicons
        for (const size of [16, 32]) {
            const canvas = createCanvas(size, size);
            const ctx = canvas.getContext('2d');

            // Simplified icon for small sizes
            const center = size / 2;
            const scale = size / 32;

            // Background
            ctx.fillStyle = this.baseColor;
            ctx.fillRect(0, 0, size, size);

            // Simple wave pattern
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, 2 * scale);
            ctx.lineCap = 'round';

            // Single wave
            ctx.beginPath();
            for (let x = 0; x <= size; x += 1) {
                const y = center + Math.sin(x * 0.3) * (3 * scale);
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            const buffer = canvas.toBuffer('image/png');
            const filename = `favicon-${size}x${size}.png`;
            const filepath = path.join(this.iconDir, filename);

            await fs.writeFile(filepath, buffer);
            console.log(`✓ Generated ${filename}`);
        }
    }

    async generateAppleTouchIcon() {
        const size = 180;
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');

        // Apple icons have rounded corners, but we'll generate square and let iOS handle it
        this.drawVibrateIcon(ctx, size);

        const buffer = canvas.toBuffer('image/png');
        const filepath = path.join(this.iconDir, 'apple-touch-icon.png');

        await fs.writeFile(filepath, buffer);
        console.log(`✓ Generated apple-touch-icon.png`);
    }

    async generateMaskableIcon() {
        // Maskable icons need more padding for safe area
        const size = 512;
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        const center = size / 2;
        const safeArea = size * 0.8; // 80% safe area for maskable icons

        // Background
        ctx.fillStyle = this.baseColor;
        ctx.fillRect(0, 0, size, size);

        // Scale down the icon to fit in safe area
        const scale = safeArea / size;
        ctx.save();
        ctx.translate(center - (center * scale), center - (center * scale));
        ctx.scale(scale, scale);

        this.drawVibrateIcon(ctx, size);
        ctx.restore();

        const buffer = canvas.toBuffer('image/png');
        const filepath = path.join(this.iconDir, 'icon-maskable-512x512.png');

        await fs.writeFile(filepath, buffer);
        console.log(`✓ Generated icon-maskable-512x512.png`);
    }

    async generateAllIcons() {
        console.log('🎨 Generating PWA icons...');
        
        await this.ensureIconDirectory();

        // Generate standard PWA icons
        for (const size of iconSizes) {
            await this.generateIcon(size);
        }

        // Generate favicons
        await this.generateFavicon();

        // Generate Apple touch icon
        await this.generateAppleTouchIcon();

        // Generate maskable icon
        await this.generateMaskableIcon();

        console.log('✅ All icons generated successfully!');
    }
}

// Run if called directly
if (require.main === module) {
    const generator = new IconGenerator();
    generator.generateAllIcons().catch(console.error);
}

module.exports = IconGenerator;