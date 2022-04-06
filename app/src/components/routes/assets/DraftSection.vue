
<template lang='pug'>

section(@click.self='focus_editor' :class='classes')

    div.actions
        app-btn(icon='settings' @click='modify' data-tip="Section settings")
        app-btn(icon='content_cut' @click='remove' color='error' data-tip="Cut section")

    div.inner(@click.self='focus_editor')

        app-html(v-if='type === "text"' ref='app_html' v-model='text_html'
            :variables='text_variables')

        template(v-if='content.type === "images"')
            shared-hero.hero(v-if='section.is_hero' :image='content.images[0]'
                :theme_style='theme_style' :first='first_hero' @click='modify')
            shared-slideshow(v-else :images='content.images' :aspect='images_aspect'
                :crop='content.crop' @img_click='modify')

        shared-video(v-if='content.type === "video"' @modify='modify' :format='content.format'
            :id='content.id' :caption='content.caption' :start='content.start' :end='content.end')

        shared-chart(v-if='content.type === "chart"' :type='content.chart' :data='content.data'
            :threshold='content.threshold' :title='content.title' :caption='content.caption'
            :dark='$store.state.dark_message' @click='modify')

        shared-pagebait(v-if='content.type === "page"' :button='content.button'
            :headline='page_headline' :desc='content.desc' :image='content.image'
            @click.native='modify')

    draft-section-respond(:profile='profile' :section='section' @click.native.self='focus_editor')

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DraftAddSection from './DraftAddSection.vue'
import DraftSectionRespond from './DraftSectionRespond.vue'
import SharedVideo from '@/shared/SharedVideo.vue'
import SharedChart from '@/shared/SharedChart.vue'
import SharedSlideshow from '@/shared/SharedSlideshow.vue'
import SharedHero from '@/shared/SharedHero.vue'
import SharedPagebait from '@/shared/SharedPagebait.vue'
import {gen_variable_items} from '@/services/misc/templates'
import {Section} from '@/services/database/sections'
import {Draft} from '@/services/database/drafts'
import {ContentPage, ContentText} from '@/services/database/types'
import {section_classes} from '@/shared/shared_functions'
import {Profile} from '@/services/database/profiles'
import {blob_image_size} from '@/services/utils/image'


@Component({
    components: {DraftAddSection, DraftSectionRespond, SharedSlideshow, SharedVideo, SharedChart,
        SharedPagebait, SharedHero},
    inject: ['theme_style_props'],
})
export default class extends Vue {

    declare readonly theme_style_props:Record<string, string>  // Injected

    @Prop({required: true}) declare readonly draft:Draft
    @Prop({required: true}) declare readonly section:Section
    @Prop({default: undefined}) declare readonly profile:Profile|undefined
    @Prop({type: Boolean, required: true}) declare readonly first_hero:boolean

    images_aspect:[number, number]|null = null

    get content(){
        return this.section.content
    }

    get type(){
        return this.content.type
    }

    get classes(){
        // Return classes for the section
        return section_classes(this.section)
    }

    get text_variables(){
        // Get variables for dynamic content as best can with data available
        const sender_name = this.draft.options_identity.sender_name
            ?? this.profile?.msg_options_identity.sender_name ?? null
        const lifespan = this.draft.options_security.lifespan
            ?? this.profile?.msg_options_security.lifespan ?? Infinity
        const max_reads = this.draft.options_security.max_reads
            ?? this.profile?.msg_options_security.max_reads ?? Infinity
        return gen_variable_items(null, null, sender_name, this.draft.title, new Date(), max_reads,
            lifespan)
    }

    get page_headline(){
        // If page has no headline or desc, show untitled as otherwise hard to know it's a page
        const content = this.section.content as ContentPage
        return content.headline || (content.desc ? '' : "[Untitled Page]")
    }

    get text_html(){
        return (this.content as ContentText).html
    }
    set text_html(html){
        ;(this.content as ContentText).html = html
        void self.app_db.sections.set(this.section)
    }

    get theme_style(){
        return this.profile?.options.theme_style ?? 'modern'
    }

    modify(){
        // Emit modify event so parent can open a dialog
        this.$emit('modify', this.section)
    }

    remove(){
        // Request removal of this section
        this.$emit('remove', this.section)
    }

    focus_editor(){
        // If text section is clicked, focus the text area for editing
        // NOTE Normally section's padding would prevent focusing the text area
        if (this.type === 'text'){
            // Accesses private method of AppHtml
            ;(this.$refs['app_html'] as unknown as {focus:()=>void}).focus()
        }
    }

    @Watch('content.images.0.data', {immediate: true}) async watch_images(){
        // Recalculate the aspect ratio for images section based on the first image
        if (this.content.type === 'images' && this.content.images.length){
            const size = await blob_image_size(this.content.images[0]!.data)
            this.images_aspect = [size.width, size.height]
        } else {
            this.images_aspect = null  // Reset if had one before
        }
    }
}

</script>


<style lang='sass' scoped>

section

    &.type-text
        // Let user know that clicking anywhere in section will trigger text editing
        cursor: text

    &:focus-within, &:hover
        border-color: rgba(var(--primary_num), 0.4)

    &:focus-within
        border-color: rgba(var(--accent_num), 0.4)

    &:hover
        .actions
            // Reveal actions toolbar when hovering over section or the toolbar itself
            > *
                visibility: visible
            z-index: 10  // MUST only be applied on hover to prevent overlapping sections' actions
            opacity: 0.6

            &:hover
                opacity: 1  // Give full opacity if hovering over the toolbar itself

        .respondbar
            visibility: visible !important

    .actions
        // Style (but initially hide) actions toolbar in right gutter
        display: flex
        flex-direction: column
        position: absolute
        top: 0  // For some reason this doesn't default to zero for standout sections
        right: -48px - 2

        // Default to hiding bar contents only, so that bar itself can still receive hover
        > *
            visibility: hidden

        [data-tip]::after
            // Position tooltip on left of button as doesn't go off page
            top: auto !important
            right: 60px

    .respondbar:not(.respondable)
        visibility: hidden

    .hero, ::v-deep .slideshow
        cursor: pointer

</style>
