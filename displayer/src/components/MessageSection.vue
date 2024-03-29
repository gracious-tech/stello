
<template lang='pug'>

//- Need to teleport section when fullscreening so can truely display above everything else
teleport(to='.stello-displayer' :disabled='!fullscreen')
    section(:class='classes' @click.self='fullscreen = false')
        div.inner
            div(v-if='content.type === "text"' v-html='content.html')
            SectionSlideshow(v-if='content.type === "images"' :content='content'
                :first_hero='first_hero' @displayed='on_displayed_change'
                @fullscreen='toggle_fullscreen')
            SharedVideo(v-if='content.type === "video"' :format='content.format' :id='content.id'
                :caption='content.caption' :start='content.start' :end='content.end')
            SharedChart(v-if='content.type === "chart"' :type='content.chart' :data='content.data'
                :threshold='content.threshold' :title='content.title' :caption='content.caption'
                :dark='dark' :id='section.id' @click='toggle_fullscreen')
            SectionFiles(v-if='content.type === "files"' :id='section.id' :content='content')
            SectionPagebait(v-if='content.type === "page"' :page='section')
        SectionRespond(:section='section' :subsection='subsection')
        svg.close(v-if='fullscreen' @click='fullscreen = false' viewBox='0 0 24 24')
            path(d=`M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59
                19 19 17.59 13.41 12z`)

</template>


<script lang='ts'>

import {computed, PropType, ref, watch, provide, defineComponent} from 'vue'

import SectionSlideshow from './SectionSlideshow.vue'
import SectionFiles from './SectionFiles.vue'
import SectionPagebait from './SectionPagebait.vue'
import SharedVideo from '../shared/SharedVideo.vue'
import SharedChart from '../shared/SharedChart.vue'
import SectionRespond from './SectionRespond.vue'
import {PublishedSection} from '../shared/shared_types'
import {section_classes} from '../shared/shared_functions'
import {store} from '@/services/store'


export default defineComponent({

    components: {SectionSlideshow, SharedVideo, SharedChart, SectionFiles, SectionRespond,
        SectionPagebait},

    props: {
        section: {
            type: Object as PropType<PublishedSection>,
            required: true,
        },
        first_hero: {
            type: Boolean,
            required: true,
        },
    },

    setup(props){

        // Ref for transfering subsection id between slideshow and respond
        const subsection = ref<string|null>(null)
        const on_displayed_change = (id:string) => {
            subsection.value = id
        }

        // Ref for toggling fullscreen (also provide so children can respond to teleport)
        const fullscreen = ref(false)
        provide('fullscreen', fullscreen)

        // Method for toggling fullscreen value
        const multi_col_limit = 700 + 48*2  // WARN Keep in sync with displayer styles
        const toggle_fullscreen = () => {
            // WARN Viewport width can change so always recheck
            const is_single_col = self.document.documentElement.clientWidth < multi_col_limit
            // Only allow disabling if image already taking up whole viewport width (single col)
            fullscreen.value = is_single_col ? false : !fullscreen.value
        }

        // Disabling of page scroll during fullscreen
        const set_page_scroll = (value:boolean) => {
            // NOTE Applying on <html> doesn't work for Safari
            self.document.body.style.overflowY = value ? 'auto' : 'hidden'
        }
        watch(fullscreen, value => {
            set_page_scroll(!value)
        })

        // Classes to apply to section
        const classes = computed(() => {
            const items = [...section_classes(props.section)]
            if (fullscreen.value){
                items.push('fullscreen')
            }
            return items
        })

        // Message contents will now be displayed, so any errors no longer "critical"
        self.app_report_error_critical = false

        return {
            content: computed(() => props.section.content),
            classes,
            subsection,
            on_displayed_change,
            fullscreen,
            toggle_fullscreen,
            dark: computed(() => store.state.dict.dark),
        }
    },
})

</script>


<style lang='sass' scoped>

@import 'src/shared/styles/utils'


.fullscreen

    // Position over whole viewport
    position: fixed
    z-index: 100
    top: 0
    bottom: 0
    left: 0
    right: 0

    // Remove any margins section normally has
    margin: 0
    padding: 0
    border-style: none

    // Make opaque so can't see content behind it
    @include stello_themed(background-color, white, black)

    // Reverse order of elements so that respondbar is above (so popups don't appear out of screen)
    display: flex
    flex-direction: column-reverse
    justify-content: center

    // Ensure a little padding below captions
    padding-bottom: 12px

    .inner
        overflow-y: hidden  // Prevent overflow of container

        :deep(.root)
            height: 100%  // Prevent overflow of container
            overflow-y: auto  // Allow scrolling if goes off page (important for caption etc)

            .slideshow
                border-radius: 0  // Remove rounded corners since no x margin anymore

            .buttons
                cursor: zoom-out  // Clicking middle now does reverse of zoom-in

            // Give headings/caption margin so don't touch viewport edge
            .cap
                margin-left: 24px
                margin-right: 24px
            h2
                margin-left: 48px  // Greater to not overlap close button
                margin-right: 48px

    .respondbar

        :deep(.position)
            // Give popups some margin so don't touch screen edge
            margin-left: 24px
            margin-right: 24px

        :deep(.react_container .position)
            // Prevent reactions from being too far away from button when comments disabled
            right: auto


    .close
        // Style the close button so that it floats at top right
        position: fixed
        top: 24px
        right: 24px
        width: 36px
        height: 36px
        opacity: 0.5

        path
            fill: currentColor

        &:hover
            opacity: 1
            cursor: pointer

</style>
