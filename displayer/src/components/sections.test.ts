
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'

import SectionFiles from './SectionFiles.vue'
import SectionPagebait from './SectionPagebait.vue'
import SectionRespond from './SectionRespond.vue'
import SectionSlideshow from './SectionSlideshow.vue'
import SharedHero from '../shared/SharedHero.vue'
import SharedSlideshow from '../shared/SharedSlideshow.vue'
import {make_msg, set_store_state} from '../../tests/unit_utils'
import {database} from '@/services/database'
import {displayer_config} from '@/services/displayer_config'
import {store} from '@/services/store'
import * as responses from '@/services/responses'

import type {PublishedContentFiles, PublishedContentImages, PublishedSection}
    from '@/shared/shared_types'


// Mock responses so can control success
vi.mock('@/services/responses', () => ({
    respond_reply: vi.fn(),
    respond_reaction: vi.fn(),
    respond_read: vi.fn(),
    respond_subscription: vi.fn(),
}))


// Asset data that can be returned by mocked get_asset
const ASSET = new Uint8Array([1, 2, 3]).buffer


function settle():Promise<void>{
    // Wait for db reads triggered on mount to complete
    return new Promise(resolve => {
        setTimeout(resolve, 20)
    })
}


beforeAll(async () => {
    await database.connect()
})

beforeEach(() => {
    set_store_state()
    store._state.msg = make_msg({id: `m${Math.random()}`, resp_token: 'tok'})
    displayer_config.allow_comments = false
    displayer_config.allow_reactions = false
    // Reaction assets
    vi.stubGlobal('fetch', (url:string) => Promise.resolve(
        new Response(url.endsWith('.json') ? '{}' : '<svg id="IDPREFIXa"></svg>')))
})

afterEach(async () => {
    await flushPromises()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


describe('SectionFiles', () => {

    // Content fixture
    const content = (download:boolean, label=''):PublishedContentFiles =>
        ({type: 'files', filename: 'doc.pdf', mimetype: 'application/pdf', label, download})

    // Labels
    test('label defaults to Download', () => {
        expect(mount(SectionFiles, {props: {id: 'f', content: content(true)}}).text())
            .toBe("Download")
        expect(mount(SectionFiles, {props: {id: 'f', content: content(true, "Get it")}}).text())
            .toBe("Get it")
    })

    // Failure
    test('shows error when asset unavailable', async () => {
        vi.spyOn(store, 'get_asset').mockResolvedValue(null)
        const wrapper = mount(SectionFiles, {props: {id: 'f', content: content(true)}})
        await wrapper.find('button').trigger('click')
        await flushPromises()
        expect(wrapper.find('button').classes()).toContain('error')
    })

    // Download
    test('downloads via link with filename and only fetches once', async () => {
        const get = vi.spyOn(store, 'get_asset').mockResolvedValue(ASSET)
        const clicks:HTMLAnchorElement[] = []
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(
                this:HTMLAnchorElement){
            clicks.push(this)
        })
        const wrapper = mount(SectionFiles, {props: {id: 'f', content: content(true)}})
        await wrapper.find('button').trigger('click')
        await flushPromises()
        expect(get).toHaveBeenCalledWith('f')
        expect(clicks[0]!.download).toBe('doc.pdf')
        expect(clicks[0]!.href).toMatch(/^blob:/)
        expect(wrapper.text()).toBe("Click to save")
        await wrapper.find('button').trigger('click')
        expect(get).toHaveBeenCalledOnce()
        expect(clicks).toHaveLength(2)
    })

    // Open
    test('opens in new tab when not downloading', async () => {
        vi.spyOn(store, 'get_asset').mockResolvedValue(ASSET)
        const open = vi.spyOn(self, 'open').mockReturnValue(null)
        const wrapper = mount(SectionFiles, {props: {id: 'f', content: content(false)}})
        await wrapper.find('button').trigger('click')
        await flushPromises()
        expect(open).toHaveBeenCalledWith(expect.stringMatching(/^blob:/), '_blank')
        expect(wrapper.text()).toBe("Click to open")
    })
})


describe('SectionPagebait', () => {

    // Page fixture
    const page = (image:string|null):PublishedSection => ({id: 'p', respondable: false,
        content: {type: 'page', button: false, headline: "Head", desc: "Desc", image,
            sections: []}})

    // No image
    test('renders headline and opens page on click', async () => {
        const get = vi.spyOn(store, 'get_asset')
        const wrapper = mount(SectionPagebait, {props: {page: page(null)}})
        expect(wrapper.find('.hline').text()).toBe("Head")
        expect(wrapper.find('.desc').text()).toBe("Desc")
        expect(get).not.toHaveBeenCalled()
        await wrapper.find('.pagebait').trigger('click')
        expect(store.state.msg!.page?.id).toBe('p')
    })

    // Image formats
    test('fetches webp or jpeg image depending on support', async () => {
        const get = vi.spyOn(store, 'get_asset').mockResolvedValue(ASSET)
        let wrapper = mount(SectionPagebait, {props: {page: page('img')}})
        await flushPromises()
        expect(get).toHaveBeenLastCalledWith('img')
        expect(wrapper.find('.image').exists()).toBe(true)

        store._state.webp_supported = false
        get.mockResolvedValue(null)
        wrapper = mount(SectionPagebait, {props: {page: page('img')}})
        await flushPromises()
        expect(get).toHaveBeenLastCalledWith('imgj')
        expect(wrapper.find('.image').exists()).toBe(false)
    })
})


describe('SectionSlideshow', () => {

    // Content fixture
    const content = (hero=false):PublishedContentImages => ({type: 'images', ratio_width: 4,
        ratio_height: 3, hero, images: [{id: 'a', caption: "A"}, {id: 'b', caption: "B"}]})

    // Slideshow
    test('loads images and reports displayed image and clicks', async () => {
        const get = vi.spyOn(store, 'get_asset').mockImplementation(
            id => Promise.resolve(id === 'a' ? ASSET : null))
        const wrapper = mount(SectionSlideshow, {props: {content: content(), first_hero: false}})
        await flushPromises()
        expect(get.mock.calls).toEqual([['a'], ['b']])
        const slideshow = wrapper.findComponent(SharedSlideshow)
        const images = slideshow.props('images') as {data:Blob|null}[]
        expect(images[0]!.data?.type).toBe('image/webp')
        expect(images[1]!.data).toBe(null)
        expect(slideshow.props('aspect')).toEqual([4, 3])
        expect(wrapper.emitted('displayed')).toEqual([['a']])
        slideshow.vm.$emit('displayed', 1)
        expect(wrapper.emitted('displayed')![1]).toEqual(['b'])
        slideshow.vm.$emit('img_click')
        expect(wrapper.emitted('fullscreen')).toHaveLength(1)
    })

    // Jpeg fallback and old formats
    test('uses jpeg ids when webp unsupported and supports old asset_webp field', async () => {
        store._state.webp_supported = false
        const get = vi.spyOn(store, 'get_asset').mockResolvedValue(ASSET)
        const old = {...content(), images: [{asset_webp: 'old', caption: ''}]}
        const wrapper = mount(SectionSlideshow, {props: {
            content: old as unknown as PublishedContentImages, first_hero: false}})
        await flushPromises()
        expect(get).toHaveBeenCalledWith('oldj')
        const images = wrapper.findComponent(SharedSlideshow).props('images') as {data:Blob}[]
        expect(images[0]!.data.type).toBe('image/jpeg')
    })

    // Hero
    test('renders hero for hero images', () => {
        vi.spyOn(store, 'get_asset').mockResolvedValue(null)
        const wrapper = mount(SectionSlideshow, {props: {content: content(true),
            first_hero: true}})
        const hero = wrapper.findComponent(SharedHero)
        expect(hero.props('first')).toBe(true)
        expect(hero.props('theme_style')).toBe('modern')
    })
})


describe('SectionRespond', () => {

    // Section fixture
    const sect = (respondable=true):PublishedSection => ({id: 's', respondable,
        content: {type: 'text', html: '', standout: null}})

    // Mount with optional error handler
    const mount_respond = (props:{section?:PublishedSection, subsection?:string|null}={},
            error_handler?:(error:unknown) => void) => mount(SectionRespond, {
        props: {section: sect(), ...props},
        attachTo: self.document.body,
        global: {config: error_handler ? {errorHandler: error_handler} : {}},
    })

    // Disabled
    test('hidden when responses not allowed or section not respondable', () => {
        expect(mount_respond().find('.respondbar').exists()).toBe(false)
        displayer_config.allow_comments = true
        displayer_config.allow_reactions = true
        expect(mount_respond({section: sect(false)}).find('.respondbar').exists()).toBe(false)
    })

    // Popups created lazily
    test('popups only created after hovering', async () => {
        displayer_config.allow_comments = true
        displayer_config.allow_reactions = true
        const wrapper = mount_respond()
        expect(wrapper.find('.position').exists()).toBe(false)
        await wrapper.find('.respondbar').trigger('mouseenter')
        expect(wrapper.findAll('.position')).toHaveLength(2)
    })

    // Comments
    test('sends comment, records it and focuses textarea on click', async () => {
        displayer_config.allow_comments = true
        vi.mocked(responses.respond_reply).mockResolvedValue(true)
        const wrapper = mount_respond({subsection: 'sub'})
        await settle()
        await wrapper.find('.respondbar').trigger('mouseenter')
        await wrapper.find('.reply_container button').trigger('click')
        expect(self.document.activeElement).toBe(wrapper.find('textarea').element)

        // Empty ignored
        await wrapper.find('form').trigger('submit')
        expect(responses.respond_reply).not.toHaveBeenCalled()

        await wrapper.find('textarea').setValue(" Nice ")
        await wrapper.find('form').trigger('submit')
        await flushPromises()
        expect(responses.respond_reply).toHaveBeenCalledWith('tok', "Nice", 's', 'sub')
        expect(wrapper.find('.last').text()).toBe("Nice")
        expect(wrapper.find('.prev').text()).toContain("Commented")
        expect(wrapper.find('.reply_container button').classes()).toContain('responded')
        await vi.waitFor(async () => expect(
            await database.reply_list(store.state.msg!.id, 's', 'sub')).toHaveLength(1))

        // Changing subsection reloads replies from db
        await wrapper.setProps({subsection: 'other'})
        await settle()
        expect(wrapper.find('.prev').exists()).toBe(false)
        expect(wrapper.find('.last').exists()).toBe(false)
    })

    test('comment failure shows error', async () => {
        displayer_config.allow_comments = true
        vi.mocked(responses.respond_reply).mockResolvedValue(false)
        const wrapper = mount_respond()
        await wrapper.find('.respondbar').trigger('mouseenter')
        await wrapper.find('textarea').setValue("Nice")
        await wrapper.find('textarea').trigger('keyup', {key: 'Enter', ctrlKey: true})
        await flushPromises()
        expect(wrapper.find('form button').classes()).toContain('error')
        expect(wrapper.find('.last').exists()).toBe(false)
    })

    // Keyboard users never trigger mouseenter
    test('clicking comment button without hovering does not error', async () => {
        displayer_config.allow_comments = true
        const errors:unknown[] = []
        const wrapper = mount_respond({}, error => {errors.push(error)})
        await wrapper.find('.reply_container button').trigger('click')
        // Keyboard activation (no mouseenter) must not throw
        expect(errors).toEqual([])
    })

    // Reactions
    test('reacting sets, toggles off and persists reaction', async () => {
        displayer_config.allow_reactions = true
        vi.mocked(responses.respond_reaction).mockResolvedValue(true)
        const wrapper = mount_respond()
        await settle()
        await wrapper.find('.respondbar').trigger('mouseenter')
        await wrapper.find('.react_container').trigger('mouseenter')
        const buttons = wrapper.findAll('.reactions button')
        expect(buttons).toHaveLength(displayer_config.reaction_options.length)

        await buttons[0]!.trigger('mousedown')
        await flushPromises()
        expect(responses.respond_reaction).toHaveBeenLastCalledWith('tok', 'like', 's', null)
        expect(wrapper.find('.react_container > button').classes()).toContain('responded')
        await vi.waitFor(async () => expect(await database.reaction_get('s')).toBe('like'))

        // Same reaction again removes it
        await buttons[0]!.trigger('mousedown')
        await flushPromises()
        expect(responses.respond_reaction).toHaveBeenLastCalledWith('tok', null, 's', null)
        await vi.waitFor(async () => expect(await database.reaction_get('s')).toBe(null))

        await wrapper.find('.react_container').trigger('mouseleave')
        await wrapper.find('.react_container > button').trigger('click')
    })

    test('failed reaction reverts and saved reaction is restored', async () => {
        displayer_config.allow_reactions = true
        await database.reaction_set(store.state.msg!.id, 's', 'sub', 'love')
        vi.mocked(responses.respond_reaction).mockResolvedValue(false)
        const wrapper = mount_respond({subsection: 'sub'})
        await settle()
        expect(wrapper.find('.react_container > button').classes()).toContain('responded')
        await wrapper.find('.respondbar').trigger('mouseenter')
        await wrapper.findAll('.reactions button')[0]!.trigger('mousedown')
        await flushPromises()
        expect(await database.reaction_get('sub')).toBe('love')
        const chosen = wrapper.findAll('.reactions .reaction')
            .filter(r => r.classes().includes('chosen'))
        expect(chosen).toHaveLength(1)
    })
})
