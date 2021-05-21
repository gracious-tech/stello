
<template lang='pug'>

section(:class='classes')
    div.inner
        div(v-if='content.type === "text"' v-html='content.html')
        Slideshow(v-if='content.type === "images"' :content='content' @displayed='on_displayed_change')
        SharedVideo(v-if='content.type === "video"' :format='content.format' :id='content.id'
            :caption='content.caption' :start='content.start' :end='content.end')
    Respond(:section='section' :subsection='subsection')

</template>


<script lang='ts'>

import {computed, PropType, ref} from 'vue'

import Slideshow from './Slideshow.vue'
import SharedVideo from '../shared/SharedVideo.vue'
import Respond from './Respond.vue'
import {PublishedSection} from '../shared/shared_types'
import {section_classes} from '../shared/shared_functions'


export default {

    components: {Slideshow, SharedVideo, Respond},

    props: {
        section: {
            type: Object as PropType<PublishedSection>,
            required: true,
        },
    },

    setup(props){

        // Ref for transfering subsection id between slideshow and respond
        const subsection = ref<string|null>(null)
        const on_displayed_change = (id:string) => {
            subsection.value = id
        }

        return {
            section: props.section,
            content: computed(() => props.section.content),
            classes: computed(() => section_classes(props.section)),
            subsection,
            on_displayed_change,
        }
    },
}

</script>


<style lang='sass' scoped>

</style>
