
<template lang='pug'>

section(:class='classes')
    div.inner
        div(v-if='content.type === "text"' v-html='content.html')
        Slideshow(v-if='content.type === "images"' :content='content')
        SharedVideo(v-if='content.type === "video"' :format='content.format' :id='content.id'
            :start='content.start' :end='content.end')
    Respond(:section_id='section.id')

</template>


<script lang='ts'>

import {computed} from 'vue'

import Slideshow from './Slideshow.vue'
import SharedVideo from '../shared/SharedVideo.vue'
import Respond from './Respond.vue'
import {PublishedSection} from '../shared/shared_types'
import {section_classes} from '../shared/shared_functions'


export default {

    components: {Slideshow, SharedVideo, Respond},

    props: {
        section: {
            type: Object,
        },
    },

    setup(props:{section:PublishedSection}){
        return {
            section: props.section,
            content: computed(() => props.section.content),
            classes: computed(() => section_classes(props.section)),
        }
    },
}

</script>


<style lang='sass' scoped>

</style>
