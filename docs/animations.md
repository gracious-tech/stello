
# Animations

## SVG
SVGs are by far the best option

 * Very small size
 * Scalable
 * Can control animation
 * Easy to edit (both image and animation)


[Lottie](https://github.com/airbnb/lottie-web) is acceptable when the animations have been created
in After Effects, but otherwise regular CSS or JS is preferrable as much easier to edit than Lottie.

## Animated PNG
This is the next best option

 * Full browser support
 * Fallback on still when not supported
 * Way better transparency than GIF

But compared to SVGs

 * Much larger size
 * Not scalable
 * Can't control animation
 * Not easy to edit

Animated WebP/AVIF/JXL may be better in future but currently has support issues.

FFMPEG can convert a sequence of PNG images into an animated PNG via:

`ffmpeg -i image%03d.png -plays 0 image.apng`

Where `-plays 0` causes it to loop infinitely.
