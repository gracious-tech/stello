
import {afterEach, describe, expect, test, vi} from 'vitest'

import {check_webp_support} from './webp'


function stub_image(outcome:'load'|'error', width=1):void{
    // Replace Image with a fake that loads or errors as soon as src is set
    vi.stubGlobal('Image', class {
        width = 0
        height = 0
        onload:(() => void)|null = null
        onerror:(() => void)|null = null
        set src(value:string){
            setTimeout(() => {
                if (outcome === 'load'){
                    this.width = width
                    this.height = width
                    this.onload?.()
                } else {
                    this.onerror?.()
                }
            })
        }
    })
}


describe('check_webp_support', () => {

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    // Supported
    test('true when image loads with dimensions', async () => {
        stub_image('load')
        expect(await check_webp_support()).toBe(true)
    })

    // Loads but no dimensions
    test('false when image loads without dimensions', async () => {
        stub_image('load', 0)
        expect(await check_webp_support()).toBe(false)
    })

    // Not supported
    test('false when image fails to load', async () => {
        stub_image('error')
        expect(await check_webp_support()).toBe(false)
    })
})
