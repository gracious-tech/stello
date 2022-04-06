
<template lang='pug'>

div.root
    h2(v-if='title') {{ title }}
    canvas(ref='canvas')
    div.cap(v-if='caption') {{ caption }}

</template>


<script lang='ts'>

import type {PropType} from 'vue'  // Importing just as type should still keep compatible with Vue 2
import {defineComponent} from 'vue-demi'

import {parse_float} from '@/services/utils/numbers'

import type {Chart, ChartOptions, ChartData, ScriptableContext} from 'chart.js'
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

