
<template lang='pug'>

div.srow(v-for='row of floatified_rows' :class='row.display')
    div.sections
        MessageSection(v-for='section of row.sections' :key='section.id' :section='section')

//- Should credit only when message decrypted (unauthenticated readers shouldn't know about Stello)
Credit

</template>


<script lang='ts'>

import {computed} from 'vue'

import Credit from './Credit.vue'
import MessageSection from './MessageSection.vue'
import {PublishedCopy} from '../shared/shared_types'
import {floatify_rows} from '../shared/shared_functions'


export default {

    components: {Credit, MessageSection},

    props: {
        msg: {
            type: Object,
        },
    },

    setup(props:{msg:PublishedCopy}){
        const floatified_rows = computed(() => {
            // Return rows of sections data and how to display them
            return floatify_rows(props.msg.sections)
        })
        return {
            floatified_rows,
        }
    }
}

</script>


<style lang='sass' scoped>

</style>
