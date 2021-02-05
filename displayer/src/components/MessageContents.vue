
<template lang='pug'>

section(v-for='(section, i) of sections' :key='section.id' :class='section_classes[i]')
    div.inner
        div(v-if='section.content.type === "text"' v-html='section.content.html')
        Slideshow(v-if='section.content.type === "images"' :content='section.content'
            :get_asset='get_asset')
    div(v-if='!section_classes[i].includes("half-float")' style='clear: left')
    Respond(:section_id='section.id')

//- Should credit only when message decrypted (unauthenticated readers shouldn't know about Stello)
Credit

</template>


<script lang='ts'>

import Credit from './Credit.vue'
import Slideshow from './Slideshow.vue'
import Respond from './Respond.vue'
import {PublishedCopy} from '../shared/shared_types'
import {GetAsset} from '../services/types'


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
        return {
            sections: props.msg.sections,
            section_classes: props.msg.section_classes,
            get_asset: props.get_asset,
        }
    }
}

</script>


<style lang='sass' scoped>

</style>
