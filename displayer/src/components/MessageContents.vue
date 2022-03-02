
<template lang='pug'>

//- NOTE Gives each srow a higher z-index than the next, so respond popups can overlap below
//- TODO If wrapping text shorter than wrapped section, popups will appear underneath
MessageContentsRow(v-for='(row, i) of floatified_rows' :row='row' :zindex='99 - i')

</template>


<script lang='ts'>

import {computed, PropType, defineComponent} from 'vue'

import MessageContentsRow from './MessageContentsRow.vue'
import {PublishedSections} from '../shared/shared_types'
import {floatify_rows} from '../shared/shared_functions'


export default defineComponent({

    components: {MessageContentsRow},

    props: {
        sections: {
            type: Array as PropType<PublishedSections>,
            required: true,
        },
    },

    setup(props){
        const floatified_rows = computed(() => {
            // Return rows of sections data and how to display them
            return floatify_rows(props.sections)
        })
        return {
            floatified_rows,
        }
    },
})

</script>


<style lang='sass' scoped>

</style>
