
import {ref} from 'vue'
import {afterEach, beforeEach, describe, expect, test, vi, Mock} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import lottie from 'lottie-web/build/player/lottie_light'

import SharedHero from './SharedHero.vue'
import SharedSlideshow from './SharedSlideshow.vue'
import SharedSvgAnimated from './SharedSvgAnimated.vue'
import SharedSvgCss, {generate_unique_id} from './SharedSvgCss.vue'
import SharedSvgLottie from './SharedSvgLottie.vue'
import SharedVideo from './SharedVideo.vue'


// Fake lottie animation instance (see unit_setup.ts)
interface LottieInstance {
    goToAndPlay:Mock
    goToAndStop:Mock
    destroy:Mock
}


// Track fetched urls (assets are always served unless url contains 'fail')
let fetched:string[] = []

beforeEach(() => {
    fetched = []
    vi.stubGlobal('fetch', (url:string) => {
        fetched.push(url)
        if (url.includes('fail')){
            return Promise.resolve(new Response(null, {status: 500}))
        }
        return Promise.resolve(new Response(url.toLowerCase().endsWith('.json') ? '{"v": 1}'
            : '<svg><g id="IDPREFIXa"></g><use href="#IDPREFIXa"/></svg>'))
    })
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


describe('SharedSvgCss', () => {

    // Unique ids
    test('generate_unique_id gives digits', () => {
        expect(generate_unique_id()).toMatch(/^\d+$/)
    })

    // Fetching and caching
    test('fetches svg once, replacing id prefixes uniquely per use', async () => {
        const a = mount(SharedSvgCss, {props: {url: 'a.svg'}})
        await flushPromises()
        const b = mount(SharedSvgCss, {props: {url: 'a.svg', playing: false}})
        await flushPromises()
        expect(fetched).toEqual(['a.svg'])
        expect(a.html()).not.toContain('IDPREFIX')
        expect(a.find('g').attributes('id')).toMatch(/^ID\d+a$/)
        expect(a.classes()).toContain('playing')
        expect(b.classes()).not.toContain('playing')
    })

    // Failure
    test('failed fetch reports and leaves empty', async () => {
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        const wrapper = mount(SharedSvgCss, {props: {url: 'fail.svg'}})
        await flushPromises()
        expect(report).toHaveBeenCalled()
        expect(wrapper.find('svg').exists()).toBe(false)
    })
})


describe('SharedSvgLottie', () => {

    // Lifecycle
    test('loads animation, toggles playing and destroys on change/unmount', async () => {
        const load = vi.mocked(lottie.loadAnimation)
        load.mockClear()
        const wrapper = mount(SharedSvgLottie, {props: {url: 'a.json'}})
        await flushPromises()
        expect(load).toHaveBeenCalledOnce()
        expect(load.mock.calls[0]![0]).toMatchObject({autoplay: true, animationData: {v: 1}})
        const instance = load.mock.results[0]!.value as LottieInstance
        expect(instance.goToAndPlay).toHaveBeenCalledWith('rest')

        await wrapper.setProps({playing: false})
        expect(instance.goToAndStop).toHaveBeenCalledWith('rest')

        await wrapper.setProps({url: 'b.json'})
        await flushPromises()
        expect(instance.destroy).toHaveBeenCalled()
        const second = load.mock.results[1]!.value as LottieInstance
        expect(second.goToAndStop).toHaveBeenCalledWith('rest')

        wrapper.unmount()
        expect(second.destroy).toHaveBeenCalled()
    })

    // Caching and failure
    test('caches responses and reports failures', async () => {
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        mount(SharedSvgLottie, {props: {url: 'c.json'}})
        mount(SharedSvgLottie, {props: {url: 'fail.json'}})
        await flushPromises()
        mount(SharedSvgLottie, {props: {url: 'c.json'}})
        await flushPromises()
        expect(fetched.filter(url => url === 'c.json')).toHaveLength(1)
        expect(report).toHaveBeenCalledOnce()
    })

    // No instance yet
    test('changing playing before loaded does nothing', async () => {
        const wrapper = mount(SharedSvgLottie, {props: {url: 'fail2.json'}})
        vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        await wrapper.setProps({playing: false})
        await flushPromises()
        wrapper.unmount()
    })
})


describe('SharedSvgAnimated', () => {

    // Component choice
    test('uses lottie for json and css for svg', () => {
        const json = mount(SharedSvgAnimated, {props: {url: 'x/like.JSON'}})
        expect(json.findComponent(SharedSvgLottie).exists()).toBe(true)
        const svg = mount(SharedSvgAnimated, {props: {url: 'x/pray.svg'}})
        expect(svg.findComponent(SharedSvgCss).exists()).toBe(true)
        expect(svg.classes()).toContain('pray')
    })

    // Hover playing
    test('plays while hovered when not playing', async () => {
        const wrapper = mount(SharedSvgAnimated, {props: {url: 'a.svg', playing: false}})
        const inner = () => wrapper.findComponent(SharedSvgCss)
        expect(inner().props('playing')).toBe(false)
        await wrapper.trigger('mouseenter')
        expect(inner().props('playing')).toBe(true)
        await wrapper.trigger('mouseleave')
        expect(inner().props('playing')).toBe(false)
        await wrapper.setProps({hover: false})
        await wrapper.trigger('mouseenter')
        expect(inner().props('playing')).toBe(false)
    })
})


describe('SharedHero', () => {

    // Image fixture
    const image = (data:Blob|null, caption='') => ({data, caption})

    // Aspect provided
    test('uses provided aspect and renders image and caption', async () => {
        const wrapper = mount(SharedHero, {props: {image: image(new Blob(['x']), "Cap"),
            theme_style: 'formal', first: true, aspect: [2, 1]}})
        await flushPromises()
        expect(wrapper.attributes('viewBox')).toBe('0 0 1000 500')
        expect(wrapper.find('image').exists()).toBe(true)
        expect(wrapper.find('h1').text()).toBe("Cap")
        expect(wrapper.find('h1').classes()).toContain('style-formal')
        // NOTE Vue 3 also passes native click through (as `click` not declared in emits)
        await wrapper.trigger('click')
        expect(wrapper.emitted('click')).toContainEqual([])
        wrapper.unmount()
    })

    // Aspect calculated (editor)
    test('calculates aspect from bitmap when not provided', async () => {
        vi.stubGlobal('createImageBitmap', () => Promise.resolve({width: 400, height: 100}))
        const wrapper = mount(SharedHero, {props: {image: image(new Blob(['x'])),
            theme_style: 'modern', first: false}})
        await flushPromises()
        expect(wrapper.attributes('viewBox')).toBe('0 0 1000 250')
        expect(wrapper.find('foreignObject').exists()).toBe(false)
    })

    // No image yet
    test('no image while loading', () => {
        const wrapper = mount(SharedHero, {props: {image: image(null), theme_style: 'fun',
            first: false}})
        expect(wrapper.find('image').exists()).toBe(false)
        expect(wrapper.attributes('viewBox')).toBe('0 0 1000 500')
    })

    // Clip paths
    test('clip paths for every theme style', () => {
        for (const style of ['modern', 'formal', 'beautiful', 'fun', 'other']){
            for (const first of [true, false]){
                const wrapper = mount(SharedHero, {props: {image: image(null),
                    theme_style: style, first, aspect: [1, 1]}})
                const clip = wrapper.find('g').attributes('clip-path') ?? ''
                if (style === 'other'){
                    expect(clip).toBe('')
                } else {
                    expect(clip).toMatch(first ? /V0z'\)$/ : /z'\)$/)
                    expect(clip.includes('V0z')).toBe(first)
                }
            }
        }
    })
})


describe('SharedVideo', () => {

    // Youtube
    test('youtube embed with start and end', () => {
        const wrapper = mount(SharedVideo, {props: {format: 'iframe_youtube', id: 'a b',
            caption: "Cap", start: 0, end: 30}})
        const iframe = wrapper.find('iframe')
        const src = new URL(iframe.attributes('src')!)
        expect(src.origin + src.pathname).toBe('https://www.youtube-nocookie.com/embed/a%20b')
        expect(src.searchParams.get('start')).toBe('0')
        expect(src.searchParams.get('end')).toBe('30')
        expect(src.searchParams.get('rel')).toBe('0')
        expect(iframe.attributes('sandbox')).toBe('allow-scripts allow-same-origin')
        expect(iframe.attributes('allow')).toContain('fullscreen')
        expect(wrapper.find('.cap').text()).toBe("Cap")
    })

    // Youtube in app's production (file protocol)
    test('youtube proxied when served from file protocol', () => {
        vi.spyOn(self.location, 'protocol', 'get').mockReturnValue('file:')
        const wrapper = mount(SharedVideo, {props: {format: 'iframe_youtube', id: 'x'}})
        expect(wrapper.find('iframe').attributes('src')).toMatch(
            /^http:\/\/127\.0\.0\.1:44932\/youtube\?url=https%3A%2F%2Fwww\.youtube-nocookie/)
    })

    // Vimeo
    test('vimeo embed with private hash and start time', () => {
        const wrapper = mount(SharedVideo, {props: {format: 'iframe_vimeo', id: '123/abc',
            start: 75}})
        const iframe = wrapper.find('iframe')
        expect(iframe.attributes('src')).toBe(
            'https://player.vimeo.com/video/123?dnt=1&h=abc#t=1m15s')
        expect(iframe.attributes('sandbox')).toBe('allow-scripts allow-forms')
        expect(wrapper.find('.cap').exists()).toBe(false)
        const plain = mount(SharedVideo, {props: {format: 'iframe_vimeo', id: '123'}})
        expect(plain.find('iframe').attributes('src')).toBe(
            'https://player.vimeo.com/video/123?dnt=1')
    })

    // No video yet (editor)
    test('placeholder emits modify when no format', async () => {
        const wrapper = mount(SharedVideo)
        expect(wrapper.find('iframe').exists()).toBe(false)
        await wrapper.find('svg').trigger('click')
        expect(wrapper.emitted('modify')).toHaveLength(1)
    })
})


describe('SharedSlideshow', () => {

    // Image fixtures
    const blob_a = new Blob(['a'])
    const image = (id:string, data:Blob|null=null, caption='') => ({id, data, caption})

    // Scroll mocking
    let scroll_to:ReturnType<typeof vi.fn>
    beforeEach(() => {
        scroll_to = vi.fn()
        HTMLElement.prototype.scrollTo = scroll_to as unknown as HTMLElement['scrollTo']
        vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(300)
    })

    // Editor with no images
    test('empty shows placeholder and help text', () => {
        const wrapper = mount(SharedSlideshow, {props: {images: []}})
        expect(wrapper.findAll('.item')).toHaveLength(1)
        expect(wrapper.find('.cap').text()).toBe("No images added yet")
        expect(wrapper.find('.thumbs').exists()).toBe(false)
        expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 48 24')
    })

    // Single image
    test('single image has no navigation and contains image', async () => {
        const wrapper = mount(SharedSlideshow, {props: {images: [image('a', blob_a, " Cap ")],
            aspect: [4, 3]}})
        await flushPromises()
        expect(wrapper.classes()).not.toContain('multiple')
        expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 4 3')
        expect(wrapper.find('.item').classes()).toContain('contain')
        expect((wrapper.find('.item').element as HTMLElement).style.backgroundImage)
            .toMatch(/blob:/)
        expect(wrapper.find('.cap').text()).toBe("Cap")
        expect(wrapper.emitted('displayed')).toEqual([[0]])
    })

    // Cropped
    test('crop always covers', async () => {
        const wrapper = mount(SharedSlideshow, {props: {images: [image('a', blob_a)],
            crop: true}})
        expect(wrapper.find('.item').classes()).toContain('cover')
    })

    // Navigation
    test('prev/next/thumbs scroll to images, looping at ends', async () => {
        const wrapper = mount(SharedSlideshow, {props: {images: [image('a'), image('b'),
            image('c')]}, attachTo: self.document.body})
        expect(wrapper.classes()).toContain('multiple')
        await wrapper.find('.prev').trigger('click')
        expect(scroll_to).toHaveBeenLastCalledWith({left: 200, behavior: 'smooth'})
        await wrapper.find('.next').trigger('click')
        expect(scroll_to).toHaveBeenLastCalledWith({left: 100, behavior: 'smooth'})
        await wrapper.findAll('.thumb button')[2]!.trigger('click')
        expect(scroll_to).toHaveBeenLastCalledWith({left: 200, behavior: 'smooth'})

        // Scrolling updates current
        const scroller = wrapper.find('.scroller')
        vi.spyOn(scroller.element, 'scrollLeft', 'get').mockReturnValue(190)
        await scroller.trigger('scroll')
        expect(wrapper.emitted('displayed')!.at(-1)).toEqual([2])
        expect(wrapper.findAll('.thumb')[2]!.classes()).toContain('active')
        await wrapper.findAll('.next')[2]!.trigger('click')
        expect(scroll_to).toHaveBeenLastCalledWith({left: 0, behavior: 'smooth'})

        // Clicking image (not buttons)
        await wrapper.find('.buttons').trigger('click')
        expect(wrapper.emitted('img_click')).toHaveLength(1)
    })

    // Object urls
    test('creates object urls when data arrives and revokes removed ones', async () => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL')
        const images = [image('a'), image('b', blob_a)]
        const wrapper = mount(SharedSlideshow, {props: {images}})
        await flushPromises()
        expect(wrapper.findAll('.item')[0]!.classes()).toContain('cover')  // Placeholder

        // Data for first arrives, second unchanged
        const blob_b = new Blob(['b'])
        await wrapper.setProps({images: [image('a', blob_b), image('b', blob_a)]})
        await flushPromises()
        expect(wrapper.findAll('.item')[0]!.classes()).toContain('contain')
        expect(revoke).not.toHaveBeenCalled()

        // Second removed
        await wrapper.setProps({images: [image('a', blob_b)]})
        expect(revoke).toHaveBeenCalledOnce()
        wrapper.unmount()
        expect(revoke).toHaveBeenCalledTimes(2)
    })

    // Fullscreen repositioning (displayer only)
    test('repositions scroll when fullscreen changes', async () => {
        const fullscreen = ref(false)
        mount(SharedSlideshow, {props: {images: [image('a'), image('b')]},
            global: {provide: {fullscreen}}})
        fullscreen.value = true
        await flushPromises()
        expect(scroll_to).toHaveBeenLastCalledWith({left: 0})
    })
})
