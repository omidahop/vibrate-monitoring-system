#!/bin/bash

# Simple icon generation script using ImageMagick
# Install: sudo apt install imagemagick

ICON_DIR="../frontend/public/icons"
mkdir -p "$ICON_DIR"

# Colors
PRIMARY_COLOR="#2563eb"
SECONDARY_COLOR="#06b6d4"

echo "🎨 Generating PWA icons with ImageMagick..."

# Base SVG icon
cat > temp_icon.svg << EOF
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <!-- Background circle -->
  <circle cx="256" cy="256" r="240" fill="$PRIMARY_COLOR"/>
  
  <!-- Wave lines representing vibration -->
  <g stroke="white" stroke-width="12" fill="none" stroke-linecap="round">
    <path d="M 156 200 Q 206 180 256 200 Q 306 220 356 200"/>
    <path d="M 156 256 Q 206 236 256 256 Q 306 276 356 256"/>
    <path d="M 156 312 Q 206 292 256 312 Q 306 332 356 312"/>
  </g>
  
  <!-- Central monitoring device -->
  <rect x="226" y="226" width="60" height="60" fill="$SECONDARY_COLOR" rx="4"/>
  
  <!-- Device screen -->
  <rect x="236" y="236" width="40" height="40" fill="white" rx="2"/>
  
  <!-- Indicator dots -->
  <circle cx="246" cy="252" r="3" fill="$PRIMARY_COLOR"/>
  <circle cx="256" cy="252" r="3" fill="$PRIMARY_COLOR"/>
  <circle cx="266" cy="252" r="3" fill="$PRIMARY_COLOR"/>
</svg>
EOF

# Generate PWA icons
for size in 72 96 128 144 152 192 384 512; do
    magick temp_icon.svg -resize ${size}x${size} "$ICON_DIR/icon-${size}x${size}.png"
    echo "✓ Generated icon-${size}x${size}.png"
done

# Generate favicons
for size in 16 32; do
    magick temp_icon.svg -resize ${size}x${size} "$ICON_DIR/favicon-${size}x${size}.png"
    echo "✓ Generated favicon-${size}x${size}.png"
done

# Generate Apple touch icon
magick temp_icon.svg -resize 180x180 "$ICON_DIR/apple-touch-icon.png"
echo "✓ Generated apple-touch-icon.png"

# Generate maskable icon (with more padding)
cat > temp_maskable.svg << EOF
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <!-- Full background for maskable -->
  <rect width="512" height="512" fill="$PRIMARY_COLOR"/>
  
  <!-- Scaled down icon in safe area -->
  <g transform="translate(51.2,51.2) scale(0.8,0.8)">
    <!-- Wave lines -->
    <g stroke="white" stroke-width="12" fill="none" stroke-linecap="round">
      <path d="M 156 200 Q 206 180 256 200 Q 306 220 356 200"/>
      <path d="M 156 256 Q 206 236 256 256 Q 306 276 356 256"/>
      <path d="M 156 312 Q 206 292 256 312 Q 306 332 356 312"/>
    </g>
    
    <!-- Central device -->
    <rect x="226" y="226" width="60" height="60" fill="$SECONDARY_COLOR" rx="4"/>
    <rect x="236" y="236" width="40" height="40" fill="white" rx="2"/>
    
    <!-- Dots -->
    <circle cx="246" cy="252" r="3" fill="$PRIMARY_COLOR"/>
    <circle cx="256" cy="252" r="3" fill="$PRIMARY_COLOR"/>
    <circle cx="266" cy="252" r="3" fill="$PRIMARY_COLOR"/>
  </g>
</svg>
EOF

magick temp_maskable.svg -resize 512x512 "$ICON_DIR/icon-maskable-512x512.png"
echo "✓ Generated icon-maskable-512x512.png"

# Cleanup
rm temp_icon.svg temp_maskable.svg

echo "✅ All icons generated successfully!"

# Create favicon.ico
if command -v magick &> /dev/null; then
    magick "$ICON_DIR/favicon-16x16.png" "$ICON_DIR/favicon-32x32.png" "$ICON_DIR/favicon.ico"
    echo "✓ Generated favicon.ico"
fi

echo ""
echo "📁 Generated files in $ICON_DIR:"
ls -la "$ICON_DIR"