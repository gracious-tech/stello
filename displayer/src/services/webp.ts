

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

        // Set source as a minimal sized example
        img.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
    })
}
