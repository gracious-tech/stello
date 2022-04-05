
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

import type {ChartOptions, ChartData, ScriptableContext} from 'chart.js'
const chartjs_promise = import('chart.js')
const chartjs_labels_promise = import('chartjs-plugin-datalabels')
const chartjs_annotation_promise = import('chartjs-plugin-annotation')


