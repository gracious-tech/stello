
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'

import MessageContents from './MessageContents.vue'
import MessagePage from './MessagePage.vue'
import MessageReply from './MessageReply.vue'
import MessageSection from './MessageSection.vue'
import ReactionSvg from './ReactionSvg.vue'
import SectionRespond from './SectionRespond.vue'
import SectionSlideshow from './SectionSlideshow.vue'
import SharedChart from '../shared/SharedChart.vue'
import {make_msg, set_store_state} from '../../tests/unit_utils'
import {database} from '@/services/database'
import {displayer_config} from '@/services/displayer_config'
import {store} from '@/services/store'
import * as responses from '@/services/responses'

import type {PublishedContentPage, PublishedSection, PublishedSectionContent}
    from '@/shared/shared_types'


// Mock responses so can control success
vi.mock('@/services/responses', () => ({
    respond_reply: vi.fn(),
    respond_reaction: vi.fn(),
    respond_read: vi.fn(),
    respond_subscription: vi.fn(),
}))


function section<T extends PublishedSectionContent>(id:string, content:T):PublishedSection<T>{
    // Create a section with given content
    return {id, respondable: true, content}
}


function text(id:string, standout:string|null=null){
    // Create a text section
    return section(id, {type: 'text' as const, html: `<p>${id}</p>`, standout})
}


function page(id:string, sections:PublishedSection[] = []):PublishedSection<PublishedContentPage>{
    // Create a page section with given sections (one per row)
    return section(id, {type: 'page' as const, button: true, headline: `H${id}`, desc: '',
        image: null, sections: sections.map(s => [s] as [PublishedSection])})
}


beforeAll(async () => {
    await database.connect()
})

beforeEach(() => {
    set_store_state()
    store._state.msg = make_msg({id: `m${Math.random()}`, resp_token: 'tok'})
    displayer_config.allow_replies = false
    displayer_config.allow_comments = false
    displayer_config.allow_reactions = false
    vi.spyOn(store, 'get_asset').mockResolvedValue(null)
})

afterEach(() => {
    vi.restoreAllMocks()
})


describe('MessageContents', () => {

    // Rows
    test('renders rows with decreasing z-index and display classes', () => {
        const wrapper = mount(MessageContents, {props: {sections: [
            [text('a')],
            [text('b'), text('c', 'subtle')],
        ]}})
        const rows = wrapper.findAll('.srow')
        expect(rows).toHaveLength(2)
        expect((rows[0]!.element as HTMLElement).style.zIndex).toBe('99')
        expect((rows[1]!.element as HTMLElement).style.zIndex).toBe('98')
        expect(rows[0]!.classes()).toContain('single')
        expect(rows[1]!.classes()).toContain('wrap-right')
        expect(rows[1]!.findAll('section').map(s => s.text())).toEqual(['c', 'b'])
    })
})


describe('MessageSection', () => {

    // Mount a section with heavy children stubbed
    const mount_section = (s:PublishedSection, first_hero=false) => mount(MessageSection, {
        props: {section: s, first_hero},
        global: {stubs: {SharedChart: true, SharedVideo: true, SectionFiles: true}},
        attachTo: self.document.querySelector('.stello-displayer')!,
    })

    beforeEach(() => {
        self.document.body.innerHTML = '<div class="stello-displayer"></div>'
        self.app_report_error_critical = true
    })

    // Text
    test('renders text html and marks errors non-critical', () => {
        const wrapper = mount_section(text('a', 'notice'))
        expect(wrapper.find('section').classes()).toEqual(
            ['type-text', 'standout', 'standout-notice'])
        expect(wrapper.find('.inner p').text()).toBe('a')
        expect(self.app_report_error_critical).toBe(false)
    })

    // Other types
    test('renders correct component for each type', () => {
        const video = mount_section(section('v', {type: 'video', format: 'iframe_youtube',
            id: 'x', caption: '', start: null, end: null}))
        expect(video.findComponent({name: 'SharedVideo'}).exists()).toBe(true)
        const chart = mount_section(section('c', {type: 'chart', chart: 'bar', data: [],
            threshold: '', title: '', caption: ''}))
        expect(chart.findComponent(SharedChart).props('id')).toBe('c')
        const files = mount_section(section('f', {type: 'files', filename: 'f', mimetype: '',
            label: '', download: true}))
        expect(files.findComponent({name: 'SectionFiles'}).exists()).toBe(true)
        const pagebait = mount_section(page('p'))
        expect(pagebait.find('.pagebait').exists()).toBe(true)
    })

    // Slideshow integration
    test('slideshow passes displayed image to respond bar and toggles fullscreen', async () => {
        vi.spyOn(self.document.documentElement, 'clientWidth', 'get').mockReturnValue(1200)
        const wrapper = mount_section(section('i', {type: 'images', ratio_width: 2,
            ratio_height: 1, images: [{id: 'img1', caption: ''}, {id: 'img2', caption: ''}]}))
        const slideshow = wrapper.findComponent(SectionSlideshow)
        await flushPromises()
        expect(wrapper.findComponent(SectionRespond).props('subsection')).toBe('img1')
        slideshow.vm.$emit('displayed', 'img2')
        await flushPromises()
        expect(wrapper.findComponent(SectionRespond).props('subsection')).toBe('img2')

        // Fullscreen
        slideshow.vm.$emit('fullscreen')
        await flushPromises()
        const el = () => self.document.querySelector('section')!
        expect(el().classList).toContain('fullscreen')
        expect(self.document.body.style.overflowY).toBe('hidden')
        self.document.querySelector<SVGElement>('svg.close')!
            .dispatchEvent(new Event('click', {bubbles: true}))
        await flushPromises()
        expect(el().classList).not.toContain('fullscreen')
        expect(self.document.body.style.overflowY).toBe('auto')

        // Clicking section background also exits fullscreen
        slideshow.vm.$emit('fullscreen')
        await flushPromises()
        el().dispatchEvent(new Event('click'))
        await flushPromises()
        expect(el().classList).not.toContain('fullscreen')
    })

    // Single column
    test('fullscreen never enabled on narrow screens', async () => {
        vi.spyOn(self.document.documentElement, 'clientWidth', 'get').mockReturnValue(500)
        const wrapper = mount_section(section('c', {type: 'chart', chart: 'bar', data: [],
            threshold: '', title: '', caption: ''}))
        wrapper.findComponent(SharedChart).vm.$emit('click')
        await flushPromises()
        expect(wrapper.find('section').classes()).not.toContain('fullscreen')
    })
})


describe('MessagePage', () => {

    // Navigating pages
    test('opens pages, goes deeper, back and closes', async () => {
        const inner = page('inner', [text('t')])
        const outer = page('outer', [inner])
        const wrapper = mount(MessagePage)
        expect(wrapper.find('.overlay').exists()).toBe(false)

        store.change_page(outer)
        await flushPromises()
        expect(wrapper.find('h2').text()).toBe("Houter")
        expect(self.document.body.style.overflowY).toBe('hidden')

        store.change_page(store.state.msg!.page!.content.sections[0]![0] as typeof inner)
        await flushPromises()
        expect(wrapper.find('h2').text()).toBe("Hinner")

        // Back to parent
        await wrapper.find('.toolbar svg').trigger('click')
        await flushPromises()
        expect(wrapper.find('h2').text()).toBe("Houter")

        // Back from top level closes
        await wrapper.find('.toolbar svg').trigger('click')
        await flushPromises()
        expect(store.state.msg!.page).toBe(null)
        expect(self.document.body.style.overflowY).toBe('auto')
    })

    // Overlay
    test('clicking overlay closes and clears parents', async () => {
        const wrapper = mount(MessagePage)
        store.change_page(page('a'))
        await flushPromises()
        store.change_page(page('b'))
        await flushPromises()
        await wrapper.find('.overlay').trigger('click')
        await flushPromises()
        expect(store.state.msg!.page).toBe(null)

        // Back after reopening closes rather than returning to old parent
        store.change_page(page('c'))
        await flushPromises()
        await wrapper.find('.toolbar svg').trigger('click')
        expect(store.state.msg!.page).toBe(null)
    })
})


describe('MessageReply', () => {

    // Disabled
    test('hidden when replies not allowed', () => {
        expect(mount(MessageReply).find('form').exists()).toBe(false)
    })

    // Previous replies
    test('lists previous replies from db', async () => {
        displayer_config.allow_replies = true
        await database.reply_add(store.state.msg!.id, null, null)
        const wrapper = mount(MessageReply)
        await flushPromises()
        expect(wrapper.find('.prev').text()).toContain("Replied")
    })

    // Sending
    test('sends trimmed reply and records it', async () => {
        displayer_config.allow_replies = true
        vi.mocked(responses.respond_reply).mockResolvedValue(true)
        const wrapper = mount(MessageReply, {attachTo: self.document.body})
        await flushPromises()

        // Empty does nothing
        await wrapper.find('form').trigger('submit')
        expect(responses.respond_reply).not.toHaveBeenCalled()

        await wrapper.find('textarea').setValue("  Hello  ")
        await wrapper.find('textarea').trigger('keyup', {key: 'Enter', ctrlKey: true})
        await flushPromises()
        expect(responses.respond_reply).toHaveBeenCalledWith('tok', "Hello", null, null)
        expect(wrapper.find('.last').text()).toBe("Hello")
        expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
        expect(wrapper.find('.prev').exists()).toBe(true)
        await vi.waitFor(async () => expect(
            await database.reply_list(store.state.msg!.id, null, null)).toHaveLength(1))
    })

    // Failure
    test('shows error on failure and resets when typing', async () => {
        displayer_config.allow_replies = true
        vi.mocked(responses.respond_reply).mockResolvedValue(false)
        const wrapper = mount(MessageReply)
        await wrapper.find('textarea').setValue("Hello")
        await wrapper.find('form').trigger('submit')
        await flushPromises()
        expect(wrapper.find('button').classes()).toContain('error')
        expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe("Hello")
        await wrapper.find('textarea').setValue("Hello!")
        expect(wrapper.find('button').classes()).not.toContain('error')
    })

    // Double submit
    test('ignores submit while waiting', async () => {
        displayer_config.allow_replies = true
        let resolve!:(value:boolean) => void
        vi.mocked(responses.respond_reply).mockReturnValue(new Promise(r => {resolve = r}))
        const wrapper = mount(MessageReply)
        await wrapper.find('textarea').setValue("Hello")
        await wrapper.find('form').trigger('submit')
        expect(wrapper.find('svg.loading').exists()).toBe(true)
        await wrapper.find('form').trigger('submit')
        expect(responses.respond_reply).toHaveBeenCalledOnce()
        resolve(true)
        await flushPromises()
    })
})


describe('ReactionSvg', () => {

    // Url and classes
    test('uses displayer reaction url and chosen class', async () => {
        vi.stubGlobal('fetch', () => Promise.resolve(new Response('<svg></svg>')))
        const wrapper = mount(ReactionSvg, {props: {reaction: 'pray', chosen: true}})
        expect(wrapper.classes()).toEqual(expect.arrayContaining(['chosen', 'pray']))
        expect(wrapper.findComponent({name: 'SharedSvgAnimated'}).props('url'))
            .toBe('displayer/reactions/pray.svg')
        await flushPromises()
        vi.unstubAllGlobals()
    })
})
