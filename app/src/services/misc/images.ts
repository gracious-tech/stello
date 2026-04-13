
import Pica from 'pica'

import {resize_image_calc} from '@/services/utils/image'
import {bitmap_to_bitcanvas} from '@/services/utils/coding'


// Init globally so can share worker
const pica_instance = Pica()


export async function resize_image(bitcanvas:ImageBitmap|OffscreenCanvas, max_width:number,
        max_height:number, crop=false):Promise<OffscreenCanvas>{
    // Resize/crop an image bitmap or canvas, returning a canvas

    // Calculate dimensions, returning original if no resize needed
    const calc = resize_image_calc(bitcanvas.width, bitcanvas.height, max_width, max_height, crop)
    if (!calc){
        return bitcanvas instanceof OffscreenCanvas ? bitcanvas : bitmap_to_bitcanvas(bitcanvas)
    }

    // Draw (and crop) the bitmap onto a source canvas
    const {src, final_width, final_height} = calc
    const src_canvas = new OffscreenCanvas(src.w, src.h)
    src_canvas.getContext('2d')!.drawImage(
        bitcanvas, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h)

    // Resize using pica for high quality Lanczos downscaling
    // Chrome's resizeQuality is broken and results in pixelation/rough edges
    // See https://issues.chromium.org/issues/41313833
    const dst_canvas = new OffscreenCanvas(final_width, final_height)
    await pica_instance.resize(src_canvas as unknown as HTMLCanvasElement,
        dst_canvas as unknown as HTMLCanvasElement)

    return dst_canvas
}
