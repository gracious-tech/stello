
<template lang='pug'>

//- NOTE Gives each srow a higher z-index than the next, so respond popups can overlap below
//- TODO If wrapping text shorter than wrapped section, popups will appear underneath
div.srow(v-for='(row, i) of floatified_rows' :class='row.display' :style='{"z-index": 99 - i}')
    div.sections
        MessageSection(v-for='section of row.sections' :key='section.id' :section='section')

MessageReply

</template>


<script lang='ts'>

import {computed, PropType, defineComponent} from 'vue'

import MessageSection from './MessageSection.vue'
import MessageReply from './MessageReply.vue'
import {PublishedCopy} from '../shared/shared_types'
import {floatify_rows} from '../shared/shared_functions'


export default defineComponent({

    components: {MessageSection, MessageReply},

    props: {
        msg: {
            type: Object as PropType<PublishedCopy>,
            required: true,
        },
    },

    setup(props){
        const floatified_rows = computed(() => {
            // Return rows of sections data and how to display them
            return floatify_rows(props.msg.sections)
        })
        return {
            floatified_rows,
        }
    }
})

</script>


<style lang='sass' scoped>

</style>
