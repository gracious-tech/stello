

export async function blob_image_size(blob:Blob):Promise<{width:number, height:number}|null>{
    // Get the width/height of an image blob (null if can't read)
    try {
        const bitmap = await createImageBitmap(blob)
        return {
            width: bitmap.width,
            height: bitmap.height,
        }
    } catch {
        return null
    }
}


export async function resize_bitmap(bitmap:ImageBitmap, max_width:number, max_height:number,
        crop=false):Promise<ImageBitmap>{
    // Resize an image given as a blob
    // NOTE Avoid unnecessary resizing or upscaling, but do always compress to desired output format

    // Determine ratios
    const actual_ratio = bitmap.width / bitmap.height
    const desired_ratio = max_width / max_height  // Only relevant if cropping

    // If don't need to resize and don't need to crop, just return original
    if (bitmap.width <= max_width && bitmap.height <= max_height
            && (!crop || actual_ratio === desired_ratio)){
        return bitmap
    }

    // The args needed for resizing
    let src_args:[number, number, number, number] = [0, 0, bitmap.width, bitmap.height]
    let output_width:number|undefined
    let output_height:number|undefined

    // If not cropping or ratio already correct, just need a simple scale down
    if (!crop || actual_ratio === desired_ratio){

        // Work out which aspect to set to ensure all dimensions within limits
        const hypothetical_height = max_width / actual_ratio
        if (hypothetical_height > max_height){
            output_height = max_height
        } else {
            output_width = max_width
        }

    } else {

        // Crop source and then scale (and work out if cropping the width or the height)
        if (actual_ratio > desired_ratio){
            // Image too wide
            const offset = (bitmap.width - (bitmap.height * desired_ratio)) / 2
            src_args = [offset, 0, bitmap.width - offset, bitmap.height]  // x, y, w, h
            // Start with height (either original or reduced) and work out new width from there
            output_height = Math.min(max_height, bitmap.height)
            output_width = output_height * desired_ratio
        } else {
            // Image too high
            const offset = (bitmap.height - (bitmap.width / desired_ratio)) / 2
            src_args = [0, offset, bitmap.width, bitmap.height - offset]  // x, y, w, h
            // Start with width (either original or reduced) and work out new height from there
            output_width = Math.min(max_width, bitmap.width)
            output_height = output_width / desired_ratio
        }
    }

    // Resize
    return createImageBitmap(bitmap, ...src_args, {
        resizeQuality: 'high',
        resizeWidth: output_width,
        resizeHeight: output_height,
    })
}
