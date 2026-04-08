// WARN AI GENERATED - NOT REVIEWED YET

import {test, expect} from '@playwright/test'

import {_resize_image_calc} from './image'


// MOCKS for canvas_to_blob_smart

// Mock OffscreenCanvas with convertToBlob that simulates format-dependent sizes
class MockCanvas {
    width:number
    height:number
    constructor(width:number, height:number) {
        this.width = width
        this.height = height
    }
    getContext() { return null }
    async convertToBlob(options?:{type?:string, quality?:number}):Promise<Blob> {
        const type = options?.type ?? 'image/png'
        const quality = options?.quality ?? 1
        const pixels = this.width * this.height
        let size:number
        if (type === 'image/png'){
            size = pixels * 4  // PNG is largest
        } else {
            size = Math.round(pixels * quality)  // Lossy scales with quality
        }
        return new Blob([new ArrayBuffer(size)], {type})
    }
}

const _global = global as Record<string, unknown>
_global.OffscreenCanvas = MockCanvas
if (typeof self === 'undefined'){
    _global.self = _global
}

// Must import after mock is set (canvas_to_blob_smart uses canvas_to_blob from coding.ts)
import {canvas_to_blob_smart} from './image'

function make_canvas(width:number, height:number):OffscreenCanvas {
    return new MockCanvas(width, height) as unknown as OffscreenCanvas
}


// CALC_RESIZE TESTS (pure math, no mocking needed)

test.describe('_resize_image_calc', () => {

    test.describe('no resize needed (returns null)', () => {

        test('image smaller than max', () => {
            expect(_resize_image_calc(100, 50, 200, 200)).toBeNull()
        })

        test('image exactly at max', () => {
            expect(_resize_image_calc(200, 100, 200, 100)).toBeNull()
        })

        test('small image with crop flag and matching ratio', () => {
            // 100x50 with max 200x100, ratio 2:1 matches → no resize
            expect(_resize_image_calc(100, 50, 200, 100, true)).toBeNull()
        })
    })

    test.describe('scale down (no crop)', () => {

        test('width-limited: scales to fit max width', () => {
            // 1000x500 (ratio 2:1), max 200x400
            // hypothetical_height = 200/2 = 100 <= 400, so width-limited → 200x100
            const result = _resize_image_calc(1000, 500, 200, 400)!
            expect(result.final_width).toBe(200)
            expect(result.final_height).toBe(100)
            // No crop, full source used
            expect(result.src).toEqual({x: 0, y: 0, w: 1000, h: 500})
        })

        test('height-limited: scales to fit max height', () => {
            // 500x1000 (ratio 0.5), max 400x200
            // hypothetical_height = 400/0.5 = 800 > 200 → height-limited → 100x200
            const result = _resize_image_calc(500, 1000, 400, 200)!
            expect(result.final_width).toBe(100)
            expect(result.final_height).toBe(200)
            expect(result.src).toEqual({x: 0, y: 0, w: 500, h: 1000})
        })

        test('only width exceeds max', () => {
            // 800x100, max 400x200 → 400x50
            const result = _resize_image_calc(800, 100, 400, 200)!
            expect(result.final_width).toBe(400)
            expect(result.final_height).toBe(50)
        })

        test('only height exceeds max', () => {
            // 100x800, max 200x400 → 50x400
            const result = _resize_image_calc(100, 800, 200, 400)!
            expect(result.final_width).toBe(50)
            expect(result.final_height).toBe(400)
        })

        test('both dimensions exceed max equally', () => {
            // 600x400 (ratio 1.5), max 300x200 → 300x200
            const result = _resize_image_calc(600, 400, 300, 200)!
            expect(result.final_width).toBe(300)
            expect(result.final_height).toBe(200)
        })
    })

    test.describe('crop', () => {

        test('ratio already matches, just scales down', () => {
            // 800x400 (ratio 2:1), max 200x100 (ratio 2:1) → scale only
            const result = _resize_image_calc(800, 400, 200, 100, true)!
            expect(result.final_width).toBe(200)
            expect(result.final_height).toBe(100)
            expect(result.src).toEqual({x: 0, y: 0, w: 800, h: 400})
        })

        test('crop too-wide image centers horizontally', () => {
            // 1000x200, max 200x200 (desired 1:1) → too wide
            // pre_scale_width = 200*1 = 200, x = (1000-200)/2 = 400
            const result = _resize_image_calc(1000, 200, 200, 200, true)!
            expect(result.final_width).toBe(200)
            expect(result.final_height).toBe(200)
            expect(result.src).toEqual({x: 400, y: 0, w: 200, h: 200})
        })

        test('crop too-tall image centers vertically', () => {
            // 200x1000, max 200x200 (desired 1:1) → too tall
            // pre_scale_height = 200/1 = 200, y = (1000-200)/2 = 400
            const result = _resize_image_calc(200, 1000, 200, 200, true)!
            expect(result.final_width).toBe(200)
            expect(result.final_height).toBe(200)
            expect(result.src).toEqual({x: 0, y: 400, w: 200, h: 200})
        })

        test('crop wide image and scale down', () => {
            // 2000x400, max 300x200 (desired 1.5:1) → too wide, then scale
            // pre_scale_width = 400*1.5 = 600, x = (2000-600)/2 = 700
            // final_height = min(200, 400) = 200, final_width = 200*1.5 = 300
            const result = _resize_image_calc(2000, 400, 300, 200, true)!
            expect(result.final_width).toBe(300)
            expect(result.final_height).toBe(200)
            expect(result.src).toEqual({x: 700, y: 0, w: 600, h: 400})
        })

        test('crop tall image and scale down', () => {
            // 400x2000, max 200x300 (desired 2:3) → too tall, then scale
            // pre_scale_height = 400/(2/3) = 600, y = (2000-600)/2 = 700
            // final_width = min(200, 400) = 200, final_height = 200/(2/3) = 300
            const result = _resize_image_calc(400, 2000, 200, 300, true)!
            expect(result.final_width).toBe(200)
            expect(result.final_height).toBe(300)
            expect(result.src).toEqual({x: 0, y: 700, w: 400, h: 600})
        })

        test('crop small image does not upscale', () => {
            // 100x80 (ratio 1.25), max 200x100 (desired 2:1) → too tall
            // pre_scale_height = 100/2 = 50, y = (80-50)/2 = 15
            // final_width = min(200, 100) = 100, final_height = 100/2 = 50
            const result = _resize_image_calc(100, 80, 200, 100, true)!
            expect(result.final_width).toBe(100)
            expect(result.final_height).toBe(50)
            expect(result.src).toEqual({x: 0, y: 15, w: 100, h: 50})
        })

        test('crop with mismatched ratio but within max still crops', () => {
            // 150x100, max 200x200 (desired 1:1) → ratio doesn't match, needs crop
            // actual_ratio=1.5 > desired=1 → too wide
            // pre_scale_width = 100*1 = 100, x = (150-100)/2 = 25
            // final_height = min(200, 100) = 100, final_width = 100*1 = 100
            const result = _resize_image_calc(150, 100, 200, 200, true)!
            expect(result.final_width).toBe(100)
            expect(result.final_height).toBe(100)
            expect(result.src).toEqual({x: 25, y: 0, w: 100, h: 100})
        })
    })

    test.describe('edge cases', () => {

        test('fractional dimensions are rounded', () => {
            // 1001x500, max 200x400
            // hypothetical_height = 200/(1001/500) = 99.9..
            const result = _resize_image_calc(1001, 500, 200, 400)!
            expect(Number.isInteger(result.final_width)).toBe(true)
            expect(Number.isInteger(result.final_height)).toBe(true)
        })

        test('square to square', () => {
            const result = _resize_image_calc(500, 500, 100, 100)!
            expect(result.final_width).toBe(100)
            expect(result.final_height).toBe(100)
        })

        test('very tall narrow image', () => {
            // 10x10000, max 100x100 → height-limited
            // hypothetical_height = 100/0.001 = 100000 > 100 → final_width = 100*0.001 = 0.1 → 0
            const result = _resize_image_calc(10, 10000, 100, 100)!
            expect(result.final_height).toBe(100)
            expect(result.final_width).toBe(0)  // Rounds to 0 for extreme ratios
        })

        test('very wide flat image', () => {
            // 10000x10, max 100x100 → width-limited
            // hypothetical_height = 100/1000 = 0.1
            const result = _resize_image_calc(10000, 10, 100, 100)!
            expect(result.final_width).toBe(100)
            expect(result.final_height).toBe(0)  // Rounds to 0 for extreme ratios
        })

        test('crop with exact same source dimensions as max', () => {
            // Same size, same ratio → null (no resize needed)
            expect(_resize_image_calc(200, 100, 200, 100, true)).toBeNull()
        })

        test('1x1 pixel image below max', () => {
            expect(_resize_image_calc(1, 1, 100, 100)).toBeNull()
        })
    })
})


// CANVAS_TO_BLOB_SMART TESTS

test.describe('canvas_to_blob_smart', () => {

    test('returns png when small enough', async () => {
        // 100x100=10000 pixels, png=40000 < 102400 default max
        const blob = await canvas_to_blob_smart(make_canvas(100, 100))
        expect(blob.type).toBe('image/png')
    })

    test('falls back to lossy 0.95 when png too large', async () => {
        // 200x200=40000, png=160000 > 102400, lossy 0.95=38000 < 102400
        const blob = await canvas_to_blob_smart(make_canvas(200, 200))
        expect(blob.type).toBe('image/jpeg')
        expect(blob.size).toBe(Math.round(40000 * 0.95))
    })

    test('falls back to min_quality when 0.95 also too large', async () => {
        // 350x310=108500, lossy 0.95=103075 > 102400, lossy 0.90=97650 < 102400
        const blob = await canvas_to_blob_smart(make_canvas(350, 310))
        expect(blob.type).toBe('image/jpeg')
        expect(blob.size).toBe(Math.round(108500 * 0.9))
    })

    test('uses webp when specified as lossy format', async () => {
        const blob = await canvas_to_blob_smart(make_canvas(200, 200), 'webp')
        expect(blob.type).toBe('image/webp')
    })

    test('respects custom max_size', async () => {
        // 50x50=2500, png=10000 > 5000 → falls back to lossy
        const blob = await canvas_to_blob_smart(make_canvas(50, 50), 'jpeg', 0.9, 5000)
        expect(blob.type).toBe('image/jpeg')
    })

    test('respects custom min_quality', async () => {
        // 350x310=108500, 0.95 exceeds default max, falls to min_quality=0.8
        const blob = await canvas_to_blob_smart(make_canvas(350, 310), 'jpeg', 0.8)
        expect(blob.type).toBe('image/jpeg')
        expect(blob.size).toBe(Math.round(108500 * 0.8))
    })

    test('default lossy format is jpeg', async () => {
        const blob = await canvas_to_blob_smart(make_canvas(200, 200))
        expect(blob.type).toBe('image/jpeg')
    })
})
