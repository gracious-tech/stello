

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
    // Resize/crop an image bitmap, but only if needed

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
    const resize_args:ImageBitmapOptions = {resizeQuality: 'high'}

    // If not cropping or ratio already correct, just need a simple scale down
    if (!crop || actual_ratio === desired_ratio){

        // Work out which aspect to set to ensure all dimensions within limits
        const hypothetical_height = max_width / actual_ratio
        if (hypothetical_height > max_height){
            resize_args.resizeHeight = max_height
        } else {
            resize_args.resizeWidth = max_width
        }

    } else {

        // Crop source and then scale (and work out if cropping the width or the height)
        if (actual_ratio > desired_ratio){
            // Image too wide
            const pre_scale_width = bitmap.height * desired_ratio
            const x = (bitmap.width - pre_scale_width) / 2
            src_args = [x, 0, pre_scale_width, bitmap.height]  // x, y, w, h
            // Start with height (either original or reduced) and work out new width from there
            resize_args.resizeHeight = Math.min(max_height, bitmap.height)
            resize_args.resizeWidth = resize_args.resizeHeight * desired_ratio
        } else {
            // Image too high
            const pre_scale_height = bitmap.width / desired_ratio
            const y = (bitmap.height - pre_scale_height) / 2
            src_args = [0, y, bitmap.width, pre_scale_height]  // x, y, w, h
            // Start with width (either original or reduced) and work out new height from there
            resize_args.resizeWidth = Math.min(max_width, bitmap.width)
            resize_args.resizeHeight = resize_args.resizeWidth / desired_ratio
        }
    }

    // Resize
    return createImageBitmap(bitmap, ...src_args, resize_args)
}
