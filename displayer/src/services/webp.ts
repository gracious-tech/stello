
import {url64_to_buffer} from '@/services/utils/coding'


export function check_webp_support():Promise<boolean>{
    // Check whether basic lossy webp is supported

    return new Promise(resolve => {

        // Create virtual image
        const img = new Image()

        // If loads and has dimensions, then know successful
        img.onload = () => {
            resolve(img.width > 0 && img.height > 0)
        }
        img.onerror = () => {
            resolve(false)
        }

        // Set source as a minimal sized example (1:1 pixels)
        // SECURITY data: URL avoided for security reasons (disabled via CSP)
        const buffer = url64_to_buffer('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD-JaQAA3AAAAAA')
        img.src = URL.createObjectURL(new Blob([buffer], {type: 'image/webp'}))
    })
}
