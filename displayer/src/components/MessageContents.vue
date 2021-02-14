
<template lang='pug'>

div.srow(v-for='row of floatified_rows' :class='row.display')
    div.sections
        section(v-for='section of row.sections' :key='section.id' :class='section_classes(section)')
            div.inner
                div(v-if='section.content.type === "text"' v-html='section.content.html')
                Slideshow(v-if='section.content.type === "images"' :content='section.content'
                    :get_asset='get_asset')
            Respond(:section_id='section.id')

//- Should credit only when message decrypted (unauthenticated readers shouldn't know about Stello)
Credit

</template>


<script lang='ts'>

import {computed} from 'vue'

import Credit from './Credit.vue'
import Slideshow from './Slideshow.vue'
import Respond from './Respond.vue'
import {PublishedCopy} from '../shared/shared_types'
import {GetAsset} from '../services/types'
import {floatify_rows, section_classes} from '../shared/shared_functions'


export default {

    components: {Credit, Slideshow, Respond},

    props: {
        msg: {
            type: Object,
        },
        get_asset: {
            type: Function,
        },
    },

    setup(props:{msg:PublishedCopy, get_asset:GetAsset}){
        const floatified_rows = computed(() => {
            // Return rows of sections data and how to display them
            return floatify_rows(props.msg.sections)
        })
        return {
            section_classes,
            floatified_rows,
            get_asset: props.get_asset,
        }
    }
}

</script>


<style lang='sass' scoped>

</style>
