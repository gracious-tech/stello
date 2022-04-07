
<template lang='pug'>

div.root
    template(v-if='data.length')
        h2(v-if='title') {{ title }}
        canvas(ref='canvas' @click='click')
        div.cap(v-if='caption') {{ caption }}
    svg.placeholder(v-else @click='click' viewBox='0 0 24 24')
        path(d=`M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9
            17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z`)

</template>


<script lang='ts'>

import type {PropType} from 'vue'  // Importing just as type should still keep compatible with Vue 2
import {defineComponent} from 'vue-demi'

import {parse_float, mimic_formatting} from '@/services/utils/numbers'

import type {Chart, ChartOptions, ScriptableContext} from 'chart.js'
const chartjs_promise = import('./SharedChart')


export default defineComponent({

    props: {
        type: {
            type: String as PropType<'bar'|'line'|'doughnut'>,
            required: true,
        },
        data: {
            type: Array as PropType<{number:string, label:string, hue:number}[]>,
            required: true,
        },
        threshold: {
            type: String,
            default: '',
        },
        title: {
            type: String,
            default: '',
        },
        caption: {
            type: String,
            default: '',
        },
        dark: {
            type: Boolean,
            required: true,
        },
        animate: {
            type: Boolean,
            default: true,
        },
    },

    emits: ['click'],

    chart: null,  // Not in data to prevent Vue from making reactive which messes up Chart internals

    data(){
        return {
            register_promise: null as null|Promise<void>,
        }
    },

    computed: {

        threshold_num():number|null{
            // Threshold value as a number
            // NOTE Absolute value for doughnut since negatives don't make sense visually
            const float = parse_float(this.threshold)
            return this.type === 'doughnut' ? float && Math.abs(float) : float
        },

        parsed_data():{number:string, label:string, hue:number|null, float:number}[]{
            // Version of data that includes parsed number and allows null hue
            // NOTE Doughnut requires absolute values since can't distinguish visually
            return this.data.map(item => {
                const float = parse_float(item.number) ?? 0
                return {
                    ...item,
                    float: this.type === 'doughnut' ? Math.abs(float) : float,
                }
            })
        },

        total(){
            // Total value of all items
            return this.parsed_data.reduce((total, item) => total + item.float, 0)
        },

        total_threshold_shortfall(){
            // Whether sum of all items is less than threshold
            return this.threshold_num !== null && this.threshold_num > this.total
        },

        perceived_total():number|null{
            // What "total" is perceived as visually
            if (this.type !== 'doughnut'){
                return this.threshold_num  // "total" is the threshold or otherwise unknown
            }
            // For doughnut the total is either threshold or this.total if exceeds threshold
            return this.total_threshold_shortfall ? this.threshold_num : this.total
        },

        perceived_total_str(){
            // String version of perceived_total that uses original strings (so must duplicate code)
            if (this.type !== 'doughnut'){
                return this.threshold
            }
            // NOTE Threshold may be null so mimic first data item instead
            return this.total_threshold_shortfall ? this.threshold :
                mimic_formatting(this.data[0]?.number ?? '', this.total)
        },

        thresh_data(){
            // Data that takes into account if a threshold-shortfall item is included
            const items = [...this.parsed_data]
            if (this.type === 'doughnut' && this.total_threshold_shortfall){
                const float = this.threshold_num! - this.total
                items.push({
                    number: mimic_formatting(this.threshold, float),
                    label: '',
                    hue: null,
                    float,
                })
            }
            return items
        },

        data_nums(){
            // Array of floats from data
            return this.thresh_data.map(item => item.float)
        },

        chart_options(){
            // Chart options

            // Determine padding based on chart type
            let padding = {top: 0, bottom: 0, left: 0, right: 0}
            if (this.type === 'doughnut'){
                // Add a little on all sides, otherwise doughnut sometimes gets clipped
                padding = {top: 20, bottom: 20, left: 20, right: 20}
            } else if (this.type === 'line'){
                // Top padding needed to prevent highest label from getting cut
                // Side padding needed to prevent labels from getting cut
                padding = {top: 25, bottom: 0, left: 40, right: 40}
            }

            // Helper for generating a color value for item given via its index
            const get_color = (i:number, alpha:number) => {
                const hue = this.thresh_data[i]!.hue
                if (hue === null){
                    return `hsla(0, 0%, 50%, ${alpha})`
                }
                return `hsla(${hue}, 50%, 50%, ${alpha})`
            }

            // Text color (either can be used for bg or fg)
            const text_normal = this.dark ? 'hsla(0, 0%, 100%, 0.8)' : 'hsla(0, 0%, 0%, 0.8)'
            const text_invert = this.dark ? 'hsla(0, 0%, 0%, 0.8)' : 'hsla(0, 0%, 100%, 0.8)'

            // Generate colors arrays from item hues
            let bg_color:unknown = this.thresh_data.map((item, i) => get_color(i, 0.5))
            const bg_color_hover:unknown = this.thresh_data.map((item, i) => get_color(i, 1))

            // Border color of doughnut segments should match displayer bg
            // Creates artificial offset of segments (real offset ruins positioning of center total)
            let border_color:unknown = this.dark ? '#111111' : '#eeeeee'

            // Line chart has one single fill bg so must be a gradient of the item colors
            // WARN Can't display line chart if only one item (and breaks gradient logic)
            if (this.type === 'line' && this.data.length > 1){

                // Create translucent bg gradient
                bg_color = (ctx:ScriptableContext<'line'>) => {
                    if (!ctx.chart.chartArea){
                        return  // chartArea not available first call (for just a moment)
                    }
                    // Create gradient that covers chart area (accounting for padding)
                    const gradient = ctx.chart.ctx.createLinearGradient(
                        ctx.chart.chartArea.left, 0, ctx.chart.chartArea.right, 0)
                    // Determine relative size of one item (total-1 since first/last half width)
                    const one_item = 1 / (this.data.length-1)
                    for (let i = 0; i < this.data.length-1; i++){
                        // Work out relative position between this point and next
                        // NOTE Subtract half an item since very first item is half width
                        const between_points = one_item * (i+1) - one_item/2
                        // Add color and next immediately after it to create solid contrast
                        gradient.addColorStop(between_points, get_color(i, 0.2))
                        gradient.addColorStop(between_points + 0.000001, get_color(i+1, 0.2))
                    }
                    return gradient
                }

                // Create solid color gradient for the actual line
                // NOTE Logic same as above, just different alpha value for colors
                border_color = (ctx:ScriptableContext<'line'>) => {
                    if (!ctx.chart.chartArea){
                        return
                    }
                    const gradient = ctx.chart.ctx.createLinearGradient(
                        ctx.chart.chartArea.left, 0, ctx.chart.chartArea.right, 0)
                    const one_item = 1 / (this.data.length-1)
                    for (let i = 0; i < this.data.length-1; i++){
                        const between_points = one_item * (i+1) - one_item/2
                        gradient.addColorStop(between_points, get_color(i, 1))
                        gradient.addColorStop(between_points + 0.000001, get_color(i+1, 1))
                    }
                    return gradient
                }
            }

            return {

                // General
                animation: this.animate,
                interaction: {
                    intersect: false,  // Show tooltip for nearest item, not just when over point
                },
                scales: {
                    x: {display: false},
                    y: {display: false, beginAtZero: true},
                },
                layout: {
                    padding,
                },

                // Colors
                backgroundColor: bg_color,
                hoverBackgroundColor: bg_color_hover,
                borderColor: border_color,
                hoverBorderColor: border_color,  // Prevent color changing on hover

                // Type specific
                cutout: this.type === 'doughnut' ? 60 : undefined,
                fill: this.type === 'line',
                tension: 0.3,  // For line
                pointRadius: 0,  // For line
                hoverRadius: 0,  // Must be same as pointRadius to prevent jump
                borderRadius: this.type === 'bar' ? 10 : 0,
                borderWidth: this.type === 'bar' ? 0 : 6,

                // Plugins
                plugins: {

                    // Labels for individual items
                    datalabels: {
                        labels: {

                            label: {
                                formatter: (value, ctx) => ctx.chart.data.labels![ctx.dataIndex],
                                color: text_normal,
                                font: {size: 14, weight: 'bold'},
                                // Position center for doughnut but bottom of bars
                                anchor: this.type === 'doughnut' ? 'center' : 'start',
                                // Must position in center of label area if doughnut with zero value
                                // (otherwise will overlap another segment and confuse)
                                align: c => this.type === 'doughnut' &&
                                    !this.data_nums[c.dataIndex] ? 'center' : 'top',
                            },

                            number: {
                                // Only visible when no threshold and value isn't zero
                                // As should focus on threshold's value and relative sizes to it
                                display:
                                    c => this.threshold_num === null && this.data_nums[c.dataIndex],
                                formatter: (value, ctx) => this.thresh_data[ctx.dataIndex]!.number,
                                color: text_invert,
                                backgroundColor: text_normal,
                                font: {size: 13, weight: 'bold'},
                                borderRadius: 13,
                                padding: {left: 6, right: 6},
                                anchor: 'center',  // Position in center of bars/segments
                                // Bar displays label/number in different places so can just center
                                align: this.type === 'bar' ? 'center' : 'bottom',
                            },
                        },
                    },

                    // Additional drawn items
                    annotation: {
                        annotations: {

                            // Solid faint line for x-axis so can see if positive or negative items
                            x_axis: {
                                display: this.type !== 'doughnut',
                                type: 'line',
                                yMin: 0,
                                yMax: 0,
                                borderColor: 'hsla(0, 0%, 50%, 0.5)',
                                borderWidth: 1,
                            },

                            // Dashed line and label for threshold (non-doughnut only)
                            threshold: {
                                display: this.threshold_num !== null && this.type !== 'doughnut',
                                type: 'line',
                                yMin: this.threshold_num,
                                yMax: this.threshold_num,
                                borderColor: 'hsla(0, 0%, 50%, 0.5)',
                                borderDash: [10],
                                borderWidth: 4,
                                label: {
                                    enabled: true,
                                    content: this.threshold,
                                    backgroundColor: text_normal,
                                    color: text_invert,
                                    font: {size: 13},
                                    borderRadius: 13,
                                },
                            },

                            // Always show a total in center of doughnut
                            doughnut_total: {
                                display: this.type === 'doughnut',
                                type: 'label',
                                content: this.perceived_total_str,
                                backgroundColor: text_normal,
                                color: text_invert,
                                font: {size: 13, weight: 'bold'},
                                borderRadius: 13,
                            },

                            // Dashed cicle around total (to communicate it's a value of whole)
                            doughnut_circle: {
                                display: this.type === 'doughnut',
                                type: 'point',
                                borderDash: [10],
                                borderWidth: 4,
                                borderColor: 'hsla(0, 0%, 50%, 0.5)',
                                backgroundColor: 'transparent',
                                radius: 50,
                            },
                        },
                    },

                    // Show all details for items via tooltip when hovered
                    tooltip: {
                        displayColors: false,  // Hide color icon (broken with line gradient)
                        titleFont: {size: 16},
                        bodyFont: {size: 16},
                        padding: {top: 8, bottom: 8, left: 12, right: 12},
                        callbacks: {
                            title: tip => tip[0]!.label,
                            label: tip => {
                                const number = this.thresh_data[tip.dataIndex]!.number
                                const float = this.thresh_data[tip.dataIndex]!.float
                                if (!this.perceived_total){  // Can't be null or zero
                                    return number
                                }
                                // Add what percent this item is of total
                                const percent = Math.floor(float / this.perceived_total * 100)
                                return `${number}    (${percent}%)`
                            },
                        },
                    },
                },
            } as ChartOptions
        },
    },

    watch: {
        // Redraw whenever relevant props change
        type(){
            void this.redraw()
        },
        data: {
            deep: true,
            handler(){
                void this.redraw()
            },
        },
        threshold(){
            void this.redraw()
        },
        dark(){
            void this.redraw()
        },
    },

    mounted(){
        // Start loading/registering chart module and request first draw
        this.register_promise = this.register()
        void this.redraw()
    },

    methods: {

        async register(){
            // Load extensions for chart module
            const chartjs = await chartjs_promise
            chartjs.Chart.register(
                chartjs.BarController,
                chartjs.LineController,
                chartjs.DoughnutController,
                chartjs.CategoryScale,
                chartjs.LinearScale,
                chartjs.BarElement,
                chartjs.PointElement,
                chartjs.LineElement,
                chartjs.ArcElement,
                chartjs.Filler,
                chartjs.Tooltip,
                chartjs.plugin_datalabels,
                chartjs.plugin_annotation,
            )
        },

        async redraw(){
            // Redraw chart (have to recreate whole thing to avoid bugs)
            // NOTE Can specify chart type in dataset but changing it dynamically is buggy

            // Ensure have setup chart module already
            await this.register_promise

            // Access to chart modules (already ready since waited for register)
            const chartjs = await chartjs_promise

            // If chart already exists, destroy it
            if (this.$options['chart']){
                ;(this.$options['chart'] as Chart).destroy()
            }

            // Canvas won't be available if showing a placeholder
            if (!this.$refs['canvas']){
                return
            }

            // Create chart
            const context = (this.$refs['canvas'] as HTMLCanvasElement).getContext('2d')!
            this.$options['chart'] = new chartjs.Chart(context, {
                type: this.type,
                plugins: [chartjs.plugin_datalabels, chartjs.plugin_annotation],
                data: {
                    labels: this.thresh_data.map(item => item.label),
                    datasets: [{data: this.data_nums}],
                },
                options: this.chart_options,
            })
        },

        click(){
            // Emit event when chart clicked
            // NOTE Only if hover supported as otherwise need to click chart to show tooltips
            if (self.matchMedia('(any-hover: hover)').matches){
                this.$emit('click')
            }
        },
    },
})

</script>


<style lang='sass' scoped>

.root
    text-align: center

canvas
    cursor: pointer

h2
    text-align: center

.placeholder
    max-width: 300px
    cursor: pointer
    path
        fill: hsla(0, 0%, 50%, 0.5)

</style>
