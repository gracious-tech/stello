
import {describe, expect, test} from 'vitest'
import {mount} from '@vue/test-utils'

import SharedDarkToggle from './SharedDarkToggle.vue'
import SharedFilesIcon from './SharedFilesIcon.vue'
import SharedPagebait from './SharedPagebait.vue'
import SharedRespondReact from './SharedRespondReact.vue'
import SharedRespondReply from './SharedRespondReply.vue'
import {floatify_rows, reaction_url, section_classes, SectionLike} from './shared_functions'
import {gen_theme_style_props, hsl_to_string} from './shared_theme'


// Section fixtures
const text = (id:string, standout:string|null=null):SectionLike =>
    ({id, content: {type: 'text', standout}})
const images = (id:string, count:number, hero:boolean):SectionLike =>
    ({id, content: {type: 'images', images: new Array(count).fill({}), hero}})


describe('floatify_rows', () => {

    // Single sections
    test('single rows, with hero only for one hero image', () => {
        const rows = floatify_rows([[text('a')], [images('b', 1, true)],
            [images('c', 2, true)], [images('d', 1, false)]])
        expect(rows.map(r => [r.id, r.display, r.hero])).toEqual([
            ['a', 'single', false],
            ['b', 'single', true],
            ['c', 'single', false],
            ['d', 'single', false],
        ])
    })

    // Plain text first must come last so it can wrap
    test('plain text first wraps right with sections swapped', () => {
        const [row] = floatify_rows([[text('a'), text('b')]])
        expect(row!.display).toBe('wrap-right')
        expect(row!.sections.map(s => s.id)).toEqual(['b', 'a'])
        expect(row!.id).toBe('ab')
    })

    // Plain text second
    test('plain text second wraps left', () => {
        const [row] = floatify_rows([[images('a', 1, false), text('b')]])
        expect(row!.display).toBe('wrap-left')
        expect(row!.sections.map(s => s.id)).toEqual(['a', 'b'])
    })

    // No plain text
    test('no plain text is parallel', () => {
        const [row] = floatify_rows([[text('a', 'notice'), images('b', 1, false)]])
        expect(row!.display).toBe('parallel')
    })
})


describe('section_classes', () => {

    // Classes
    test('type and standout classes', () => {
        expect(section_classes(text('a'))).toEqual(['type-text'])
        expect(section_classes(text('a', 'subtle'))).toEqual(
            ['type-text', 'standout', 'standout-subtle'])
        expect(section_classes(images('a', 1, false))).toEqual(['type-images'])
    })
})


describe('reaction_url', () => {

    // Formats
    test('svg for pray and json for others', () => {
        expect(reaction_url('pray')).toBe('reactions/pray.svg')
        expect(reaction_url('like', 'x/')).toBe('x/reactions/like.json')
    })
})


describe('shared_theme', () => {

    // Color strings
    test('hsl_to_string uses percents for s and l only', () => {
        expect(hsl_to_string(10, 0.5, 0.25)).toBe('hsla(10, 50%, 25%, 1)')
        expect(hsl_to_string(10, 0.5, 0.25, 0.3)).toBe('hsla(10, 50%, 25%, 0.3)')
    })

    // Light mode
    test('light theme uses color as bg', () => {
        const props = gen_theme_style_props(false, 'fun', {h: 100, s: 0.5, l: 0.8})
        expect(props['--stello-style']).toBe('fun')
        expect(props['--stello-bg']).toBe('hsla(100, 50%, 80%, 1)')
        expect(props['--stello-bg-text']).toBe('black')
        expect(props['--stello-bg-image']).toMatch(/^url\(blob:/)
        expect(props['--stello-hue']).toBe('hsla(100, 75%, 50%, 1)')
    })

    // Dark mode
    test('dark theme forces dark bg', () => {
        const props = gen_theme_style_props(true, 'modern', {h: 100, s: 0.5, l: 0.8})
        expect(props['--stello-bg']).toBe('hsla(100, 50%, 30%, 1)')
        expect(props['--stello-bg-text']).toBe('white')
        expect(props['--stello-color']).toBe('hsla(100, 50%, 80%, 1)')
    })
})


describe('SharedDarkToggle', () => {

    // Toggling
    test('fill reflects value and click emits inverse', async () => {
        const wrapper = mount(SharedDarkToggle, {props: {value: true}})
        expect(wrapper.find('svg').classes()).toContain('fill-white')
        await wrapper.trigger('click')
        expect(wrapper.emitted('input')).toEqual([[false]])
        await wrapper.setProps({value: false})
        expect(wrapper.find('svg').classes()).toContain('fill-black')
    })
})


describe('SharedFilesIcon', () => {

    // Icons
    test('different icon for download and open', () => {
        const download = mount(SharedFilesIcon, {props: {download: true}})
        const open = mount(SharedFilesIcon, {props: {download: false}})
        expect(download.find('path').attributes('d')).not.toBe(open.find('path').attributes('d'))
    })
})


describe('SharedRespond buttons', () => {

    // React
    test('react button has label, default icon and passes clicks', async () => {
        const wrapper = mount(SharedRespondReact)
        expect(wrapper.text()).toBe("React")
        expect(wrapper.find('svg').exists()).toBe(true)
        await wrapper.trigger('click')
        expect(wrapper.emitted('click')).toHaveLength(1)
        const custom = mount(SharedRespondReact, {props: {label: "R"},
            slots: {default: '<i>x</i>'}})
        expect(custom.find('i').exists()).toBe(true)
        expect(custom.find('svg').exists()).toBe(false)
    })

    // Reply
    test('reply button icon changes when replied', async () => {
        const wrapper = mount(SharedRespondReply, {props: {label: "C"}})
        expect(wrapper.text()).toBe("C")
        const before = wrapper.find('path').attributes('d')
        await wrapper.setProps({replied: true})
        expect(wrapper.find('path').attributes('d')).not.toBe(before)
    })
})


describe('SharedPagebait', () => {

    // Image displayed via JS for CSP
    test('applies image as background and revokes on change', async () => {
        const blob = new Blob(['x'], {type: 'image/webp'})
        const wrapper = mount(SharedPagebait, {props: {button: false, headline: "H", desc: "D",
            image: blob}})
        await wrapper.vm.$nextTick()
        const div = wrapper.find('.image').element as HTMLDivElement
        expect(div.style.backgroundImage).toMatch(/^url\("?blob:/)
        expect(wrapper.find('.desc').text()).toBe("D")
        await wrapper.setProps({image: null})
        expect(wrapper.find('.image').exists()).toBe(false)
        wrapper.unmount()
    })

    // Button mode
    test('button mode hides image and desc', () => {
        const wrapper = mount(SharedPagebait, {props: {button: true, headline: "H", desc: "D",
            image: new Blob(['x'])}})
        expect(wrapper.classes()).toEqual(expect.arrayContaining(['btn-text', 's-primary']))
        expect(wrapper.find('.image').exists()).toBe(false)
        expect(wrapper.find('.desc').exists()).toBe(false)
    })
})
