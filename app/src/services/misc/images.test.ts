
import {beforeEach, describe, expect, test, vi} from 'vitest'


// Pica is mocked as it requires real canvases (resize maths is tested in utils/image.test.ts)
const pica_resize = vi.fn()
vi.mock('pica', () => ({default: () => ({resize: pica_resize})}))


// Minimal OffscreenCanvas that records draws and bitmap transfers
class MockCanvas {
    draws:unknown[][] = []
    transferred:unknown = null
    constructor(public width:number, public height:number){}
    getContext(type:string){
        return type === 'bitmaprenderer'
            ? {transferFromImageBitmap: (bitmap:unknown) => {this.transferred = bitmap}}
            : {drawImage: (...args:unknown[]) => {this.draws.push(args)}}
    }
}
vi.stubGlobal('OffscreenCanvas', MockCanvas)


// Import after mocks are in place
const {resize_image} = await import('./images')


describe('resize_image', () => {

    beforeEach(() => {
        pica_resize.mockReset()
    })

    test('returns canvas unchanged when no resize needed', async () => {
        const canvas = new MockCanvas(10, 10) as unknown as OffscreenCanvas
        expect(await resize_image(canvas, 100, 100)).toBe(canvas)
        expect(pica_resize).not.toHaveBeenCalled()
    })

    test('converts bitmap to canvas when no resize needed', async () => {
        const bitmap = {width: 10, height: 10} as ImageBitmap
        const result = await resize_image(bitmap, 100, 100) as unknown as MockCanvas
        expect(result).toBeInstanceOf(MockCanvas)
        expect(result.transferred).toBe(bitmap)
    })

    test('crops source then resizes with pica', async () => {
        const bitmap = {width: 1000, height: 200} as ImageBitmap
        const result = await resize_image(bitmap, 100, 100, true) as unknown as MockCanvas
        expect([result.width, result.height]).toEqual([100, 100])

        // Source canvas is the centred crop
        const [src, dst] = pica_resize.mock.calls[0] as [MockCanvas, MockCanvas]
        expect([src.width, src.height]).toEqual([200, 200])
        expect(src.draws).toEqual([[bitmap, 400, 0, 200, 200, 0, 0, 200, 200]])
        expect(dst).toBe(result)
    })
})
