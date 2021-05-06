
# Animations

## SVG
SVGs are best as both very small and infinitely scalable, and can animate with embedded CSS.

## Animated PNG
This is the next best option

 * Full browser support
 * Fallback on still when not supported
 * Way better transparency than GIF

Animated WebP/AVIF/JXL may be better in future but currently has support issues.

FFMPEG can convert a sequence of PNG images into an animated PNG via:

`ffmpeg -i image%03d.png -plays 0 image.apng`

Where `-plays 0` causes it to loop infinitely.
