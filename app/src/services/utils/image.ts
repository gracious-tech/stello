
import {canvas_to_blob} from './coding'


export async function _tmp_normalize_orientation(blob:Blob):Promise<OffscreenCanvas>{
    // Normalize image orientation by producing new image with standard orientation
    // WARN This is required before using createImageBitmap with images in Chrome
    // See https://bugs.chromium.org/p/chromium/issues/detail?id=1220671#c15
    // TODO Remove once Chrome bug fixed

    // Img element supports orientation (bitmap doesn't) so need to first turn into img
    const img = self.document.createElement('img')
    img.src = URL.createObjectURL(blob)
    await new Promise((resolve, reject) => {
        img.addEventListener('load', resolve)
        img.addEventListener('error', reject)
    })

    // Use canvas to get img back into a new blob
    const canvas = new OffscreenCanvas(img.width, img.height)
    canvas.getContext('2d')!.drawImage(img, 0, 0)

    // Clear original blob from memory so can be garbage collected
    URL.revokeObjectURL(img.src)

    return canvas
}


export async function blob_image_size(blob:Blob):Promise<{width:number, height:number}>{
    // Get the width/height of an image blob
    // WARN Dimensions will be wrong for rotated jpegs in Chrome
    // See https://bugs.chromium.org/p/chromium/issues/detail?id=1220671#c15
    const bitmap = await createImageBitmap(blob)
    return {
        width: bitmap.width,
        height: bitmap.height,
    }
}


export interface ResizeCalc {
    // Calculated crop region and final dimensions for resize_image
    src:{x:number, y:number, w:number, h:number}
    final_width:number
    final_height:number
}


export function resize_image_calc(src_width:number, src_height:number, max_width:number,
        max_height:number, crop=false):ResizeCalc|null{
    // Calculate the crop region and final dimensions for a resize operation
    // Returns null if no resize/crop is needed

    // Determine ratios
    const actual_ratio = src_width / src_height
    const desired_ratio = max_width / max_height  // Only relevant if cropping

    // If don't need to resize and don't need to crop, return null
    if (src_width <= max_width && src_height <= max_height
            && (!crop || actual_ratio === desired_ratio)){
        return null
    }

    // The crop region of the source
    let src = {x: 0, y: 0, w: src_width, h: src_height}
    let final_height = max_height
    let final_width = max_width

    // If not cropping or ratio already correct, just need a simple scale down
    if (!crop || actual_ratio === desired_ratio){

        // Work out which aspect to set to ensure all dimensions within limits
        const hypothetical_height = max_width / actual_ratio
        if (hypothetical_height > max_height){
            final_width = max_height * actual_ratio
        } else {
            final_height = hypothetical_height
        }

    } else {

        // Crop source and then scale (and work out if cropping the width or the height)
        if (actual_ratio > desired_ratio){
            // Image too wide
            const pre_scale_width = src_height * desired_ratio
            const x = (src_width - pre_scale_width) / 2
            src = {x, y: 0, w: pre_scale_width, h: src_height}
            // Start with height (either original or reduced) and work out new width from there
            final_height = Math.min(max_height, src_height)
            final_width = final_height * desired_ratio
        } else {
            // Image too high
            const pre_scale_height = src_width / desired_ratio
            const y = (src_height - pre_scale_height) / 2
            src = {x: 0, y, w: src_width, h: pre_scale_height}
            // Start with width (either original or reduced) and work out new height from there
            final_width = Math.min(max_width, src_width)
            final_height = final_width / desired_ratio
        }
    }

    return {src, final_width: Math.round(final_width), final_height: Math.round(final_height)}
}


export function rotate_image(source:OffscreenCanvas|ImageBitmap, clockwise=true):OffscreenCanvas{
    // Rotate an image by 90deg
    // Can take any source that drawImage supports as long as has width/height properties

    // Create canvas with dimensions swapped
    const new_width = source.height
    const new_height = source.width
    const canvas = new OffscreenCanvas(new_width, new_height)

    // Create context that is rotated (must first translate since rotates from top-left)
    const context = canvas.getContext('2d')!
    context.translate(clockwise ? new_width : 0, clockwise ? 0 : new_height)
    context.rotate(Math.PI / (clockwise ? 2 : -2))

    // Draw image in the rotated context
    context.drawImage(source, 0, 0)

    // Reset context in case caller does further modifications
    context.resetTransform()

    return canvas
}


export function filter_image(source:OffscreenCanvas|ImageBitmap, filter:string):OffscreenCanvas{
    // Apply filters to an image and return the result as a canvas
    const canvas = new OffscreenCanvas(source.width, source.height)
    const context = canvas.getContext('2d')!
    context.filter = filter
    context.drawImage(source, 0, 0)

    // Reset filter in case caller does further modifications
    context.filter = ''

    return canvas
}


export async function canvas_to_blob_smart(canvas:OffscreenCanvas,
        lossy_format:'jpeg'|'webp'='jpeg', min_quality=0.9, max_size=50*1024):Promise<Blob>{
    // Compress canvas using highest quality format that is less than max size
    /* NOTE Defaults are optimized for invite images (600x200px)
        Previously photos as jpeg q0.8 were 20-50kb, and text images were 5-15kb
        Jpeg quality now bumped to 0.9 so sizes will be a bit larger
        But very reasonable to use PNG up to ~50kb since jpegs were previously that anyway

        Detailed photo: 300kb (png), 67kb (jpeg 0.95), 49kb (jpeg 0.90)
            And looks fine at any of those since no sharp edges
        Detailed illustration: 96kb (png), 54kb (jpeg 0.95), 42kb (jpeg 0.90)
            Can get away with jpeg 0.9 but 0.95 better
        Mostly text: 37kb (png), 18kb (jpeg 0.95), 15kb (jpeg 0.90)
            Needs at least 0.95 jpeg

        Testing on gmail after letting gmail cache them
            30kb -> ~1 second load
            66kb -> ~2 second load

        Chosen 50kb max_size so most load within 1 second (2 feels too long)
            and many illustrations will still get a higher quality than 0.9
    */
    let blob = await canvas_to_blob(canvas, 'png')
    if (blob.size <= max_size){
        return blob
    }
    blob = await canvas_to_blob(canvas, lossy_format, 0.95)
    if (blob.size <= max_size){
        return blob
    }
    return canvas_to_blob(canvas, lossy_format, min_quality)
}
