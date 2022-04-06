
<template lang='pug'>

div.root
    h2(v-if='title') {{ title }}
    canvas(ref='canvas')
    div.cap(v-if='caption') {{ caption }}

</template>


<script lang='ts'>

import type {PropType} from 'vue'  // Importing just as type should still keep compatible with Vue 2
import {defineComponent} from 'vue-demi'

import {parse_float, mimic_formatting} from '@/services/utils/numbers'

import type {Chart, ChartOptions, ScriptableContext} from 'chart.js'
const chartjs_promise = import('chart.js')
const chartjs_labels_promise = import('chartjs-plugin-datalabels')
const chartjs_annotation_promise = import('chartjs-plugin-annotation')


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

        doughnut_total(){
            // The doughnut total will either be threshold or total of items (when > threshold)
            return Math.max(this.total, this.threshold_num ?? this.total)
        },

        thresh_data(){
            // Data that takes into account if a threshold-shortfall item is included
            const items = [...this.parsed_data]
            if (this.type === 'doughnut' && this.threshold_num !== null &&
                    this.threshold_num > this.total){
                const float = this.threshold_num - this.total
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
            const chartjs_labels = await chartjs_labels_promise
            const chartjs_annotation = await chartjs_annotation_promise
            chartjs.Chart.register(
                chartjs.LineController,
                chartjs.BarController,
                chartjs.CategoryScale,
                chartjs.LinearScale,
                chartjs.BarElement,
                chartjs.PointElement,
                chartjs.LineElement,
                chartjs.ArcElement,
                chartjs.DoughnutController,
                chartjs.Filler,
                chartjs.Tooltip,
                chartjs_labels.default,
                chartjs_annotation.default,
            )
        },

        async redraw(){
            // Redraw chart (have to recreate whole thing to avoid bugs)
            // NOTE Can specify chart type in dataset but changing it dynamically is buggy

            // Ensure have setup chart module already
            await this.register_promise

            // Access to chart modules (already ready since waited for register)
            const chartjs = await chartjs_promise
            const chartjs_labels = await chartjs_labels_promise
            const chartjs_annotation = await chartjs_annotation_promise

            // If chart already exists, destroy it
            if (this.$options['chart']){
                ;(this.$options['chart'] as Chart).destroy()
            }

            // Create chart
            const context = (this.$refs['canvas'] as HTMLCanvasElement).getContext('2d')!
            this.$options['chart'] = new chartjs.Chart(context, {
                type: this.type,
                plugins: [chartjs_labels.default, chartjs_annotation.default],
                data: {
                    labels: this.thresh_data.map(item => item.label),
                    datasets: [{data: this.data_nums}],
                },
                options: this.chart_options,
            })
        },
    },
})

</script>


<style lang='sass' scoped>

h2
    text-align: center

</style>
