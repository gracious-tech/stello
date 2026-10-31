
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'

import SharedChart from './SharedChart.vue'

import type {ChartConfiguration} from 'chart.js'


// Fake Chart class that records its config
const charts = vi.hoisted(() => [] as {config:ChartConfiguration, destroy:() => void}[])
vi.mock('./SharedChart', () => ({
    exports_promise: Promise.resolve({
        Chart: class {
            config:ChartConfiguration
            destroy = vi.fn()
            constructor(context:unknown, config:ChartConfiguration){
                this.config = config
                charts.push(this)
            }
        },
        plugin_datalabels: {},
        plugin_annotation: {},
    }),
}))


// Chart option callbacks
type Fn = (...args:unknown[]) => unknown


// Data fixture
const data = [
    {number: '$10', label: 'A', hue: 0},
    {number: '-$30', label: 'B', hue: 120},
]


async function mount_chart(props:Record<string, unknown>){
    // Mount chart and wait for it to be drawn
    const wrapper = mount(SharedChart, {props: {id: `c${Math.random()}`, type: 'bar', data,
        dark: false, ...props}})
    await flushPromises()
    return wrapper
}


function opt(path:string):unknown{
    // Get a nested option of most recently created chart via a dot path
    let value:unknown = charts.at(-1)!.config.options
    for (const key of path.split('.')){
        value = (value as Record<string, unknown>)[key]
    }
    return value
}


function fn(path:string):Fn{
    // Get a callback option of most recently created chart via a dot path
    return opt(path) as Fn
}


describe('SharedChart', () => {

    beforeEach(() => {
        charts.length = 0
        vi.spyOn(self, 'matchMedia').mockReturnValue({matches: true} as MediaQueryList)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    // Placeholder
    test('placeholder when no data, emitting click only if hover supported', async () => {
        const wrapper = await mount_chart({data: []})
        expect(wrapper.find('svg.placeholder').exists()).toBe(true)
        expect(charts).toHaveLength(0)
        await wrapper.find('svg').trigger('click')
        expect(wrapper.emitted('click')).toHaveLength(1)
        vi.mocked(self.matchMedia).mockReturnValue({matches: false} as MediaQueryList)
        await wrapper.find('svg').trigger('click')
        expect(wrapper.emitted('click')).toHaveLength(1)
    })

    // Bar
    test('bar chart data, labels and threshold annotation', async () => {
        const wrapper = await mount_chart({title: "T", caption: "C", threshold: '$50'})
        expect(wrapper.find('h2').text()).toBe("T")
        expect(wrapper.find('.cap').text()).toBe("C")
        const config = charts[0]!.config
        expect(config.type).toBe('bar')
        expect(config.data.labels).toEqual(['A', 'B'])
        expect(config.data.datasets[0]!.data).toEqual([10, -30])
        expect(opt('borderRadius')).toBe(10)
        expect(opt('backgroundColor')).toEqual(
            ['hsla(0, 50%, 50%, 0.5)', 'hsla(120, 50%, 50%, 0.5)'])
        expect(opt('plugins.annotation.annotations.threshold.display')).toBe(true)
        expect(opt('plugins.annotation.annotations.threshold.yMin')).toBe(50)
        expect(opt('plugins.annotation.annotations.doughnut_total.display')).toBe(false)

        // Labels
        const ctx = {dataIndex: 1, chart: {data: {labels: ['A', 'B']}}}
        expect(fn('plugins.datalabels.labels.label.formatter')(null, ctx)).toBe('B')
        expect(fn('plugins.datalabels.labels.label.align')(ctx)).toBe('top')
        expect(fn('plugins.datalabels.labels.number.formatter')(null, ctx)).toBe('-$30')
        // Numbers hidden when there's a threshold
        expect(fn('plugins.datalabels.labels.number.display')(ctx)).toBe(false)

        // Tooltips show percent of threshold
        expect(fn('plugins.tooltip.callbacks.title')([{label: 'A'}])).toBe('A')
        expect(fn('plugins.tooltip.callbacks.label')({dataIndex: 0})).toBe('$10    (20%)')
    })

    // No threshold
    test('numbers shown and percents not shown when no threshold', async () => {
        await mount_chart({})
        expect(fn('plugins.datalabels.labels.number.display')({dataIndex: 0})).toBe(10)
        expect(opt('plugins.annotation.annotations.threshold.display')).toBe(false)
        expect(fn('plugins.tooltip.callbacks.label')({dataIndex: 0})).toBe('$10')
    })

    // Percent values
    test('percent numbers are not given an extra percent', async () => {
        await mount_chart({data: [{number: '5%', label: 'A', hue: 0}], threshold: '10'})
        expect(fn('plugins.tooltip.callbacks.label')({dataIndex: 0})).toBe('5%')
    })

    // Doughnut with shortfall
    test('doughnut uses absolute values and adds threshold shortfall segment', async () => {
        await mount_chart({type: 'doughnut', threshold: '-$100', dark: true})
        const config = charts[0]!.config
        expect(config.data.datasets[0]!.data).toEqual([10, 30, 60])
        expect(config.data.labels).toEqual(['A', 'B', ''])
        expect(opt('cutout')).toBe(60)
        expect(opt('borderColor')).toBe('#111111')
        expect(opt('backgroundColor.2')).toBe('hsla(0, 0%, 50%, 0.5)')
        expect(opt('plugins.annotation.annotations.doughnut_total.content')).toBe('-$100')
        expect(opt('plugins.annotation.annotations.threshold.display')).toBe(false)
        expect(fn('plugins.datalabels.labels.label.align')({dataIndex: 0})).toBe('top')
        expect(fn('plugins.tooltip.callbacks.label')({dataIndex: 2})).toBe('$60    (60%)')
    })

    // Doughnut without threshold
    test('doughnut total is sum of items when no threshold', async () => {
        await mount_chart({type: 'doughnut', data: [...data, {number: '0', label: 'Z', hue: 1}]})
        expect(opt('plugins.annotation.annotations.doughnut_total.content')).toBe('$40')
        expect(fn('plugins.datalabels.labels.label.align')({dataIndex: 2})).toBe('center')
    })

    // Line gradients
    test('line chart uses gradients once chart area available', async () => {
        await mount_chart({type: 'line'})
        expect(opt('fill')).toBe(true)
        for (const key of ['backgroundColor', 'borderColor']){
            const gradient_fn = fn(key)
            expect(gradient_fn({chart: {}})).toBe(undefined)
            const stops:unknown[][] = []
            const gradient = {addColorStop: (...args:unknown[]) => stops.push(args)}
            const result = gradient_fn({chart: {chartArea: {left: 0, right: 10},
                ctx: {createLinearGradient: () => gradient}}})
            expect(result).toBe(gradient)
            expect(stops).toHaveLength(2)
            expect(stops[0]![0]).toBe(0.5)
        }
    })

    test('line chart with one item has no gradient', async () => {
        await mount_chart({type: 'line', data: [data[0]]})
        expect(typeof opt('backgroundColor')).not.toBe('function')
    })

    // Redrawing
    test('redraws when props change and destroys on unmount', async () => {
        const wrapper = await mount_chart({})
        const changes = [
            () => wrapper.setProps({type: 'line'}),
            () => wrapper.setProps({threshold: '5'}),
            () => wrapper.setProps({dark: true}),
            () => wrapper.setProps({data: [data[0]!]}),
        ]
        for (const change of changes){
            const previous = charts.at(-1)!
            await change()
            await flushPromises()
            expect(previous.destroy).toHaveBeenCalled()
        }
        expect(charts).toHaveLength(5)
        wrapper.unmount()
        expect(charts.at(-1)!.destroy).toHaveBeenCalled()
    })

    // Image export
    test('render_to_png draws to offscreen canvas with correct aspect', async () => {
        const sizes:number[][] = []
        vi.stubGlobal('OffscreenCanvas', class {
            constructor(width:number, height:number){
                sizes.push([width, height])
            }
            getContext(){
                return {}
            }
            convertToBlob(){
                return Promise.resolve(new Blob(['png']))
            }
        })
        const wrapper = await mount_chart({data: []})
        const vm = wrapper.vm as unknown as {render_to_png(width:number):Promise<Blob>}
        expect(await vm.render_to_png(100)).toBeInstanceOf(Blob)
        await wrapper.setProps({type: 'doughnut'})
        await vm.render_to_png(100)
        expect(sizes).toEqual([[100, 50], [100, 100]])
        vi.unstubAllGlobals()
    })
})


describe('SharedChart modules', () => {

    // Modules registered
    test('exports chart modules', async () => {
        const actual = await vi.importActual<typeof import('./SharedChart')>('./SharedChart')
        const exports = await actual.exports_promise
        expect(exports.Chart.registry.controllers.get('bar')).toBeDefined()
    })

    // Polyfill
    test('polyfills ResizeObserver when missing', async () => {
        vi.stubGlobal('ResizeObserver', undefined)
        delete (window as {ResizeObserver?:unknown}).ResizeObserver
        vi.resetModules()
        const actual = await vi.importActual<typeof import('./SharedChart')>('./SharedChart')
        await actual.exports_promise
        expect(window.ResizeObserver).toBeDefined()
        vi.unstubAllGlobals()
    })
})
