
<template lang='pug'>

section(@click.self='focus_editor' :class='classes')

    div.actions
        app-btn(icon='settings' @click='modify')
        app-btn(icon='delete' @click='remove' color='error')

    div.inner(@click.self='focus_editor')

        app-html(v-if='type === "text"' ref='app_html' v-model='text_html'
            :variables='text_variables')

        shared-slideshow(v-if='content.type === "images"' :images='content.images'
            :aspect='images_aspect' :crop='content.crop' editing @img_click='modify')

        shared-video(v-if='content.type === "video"' @modify='modify' :format='content.format'
            :id='content.id' :caption='content.caption' :start='content.start' :end='content.end')

        shared-pagebait(v-if='content.type === "page"' :title='content.title'
            :subtitle='content.subtitle' :img='content.image' @click.native.self='modify')

    draft-section-respond(:profile='profile' :section='section' @click.native.self='focus_editor')

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DraftAddSection from './DraftAddSection.vue'
import DraftSectionRespond from './DraftSectionRespond.vue'
import SharedVideo from '@/shared/SharedVideo.vue'
import SharedSlideshow from '@/shared/SharedSlideshow.vue'
import SharedPagebait from '@/shared/SharedPagebait.vue'
import {gen_variable_items} from '@/services/misc/templates'
import {Section} from '@/services/database/sections'
import {Draft} from '@/services/database/drafts'
import {ContentText} from '@/services/database/types'
import {section_classes} from '@/shared/shared_functions'
import {Profile} from '@/services/database/profiles'
import {blob_image_size} from '@/services/utils/image'


@Component({
    components: {DraftAddSection, DraftSectionRespond, SharedSlideshow, SharedVideo,
        SharedPagebait},
})
export default class extends Vue {

    @Prop({required: true}) declare readonly draft:Draft
    @Prop({required: true}) declare readonly section:Section
    @Prop({default: undefined}) declare readonly profile:Profile|undefined

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

    get text_html(){
        return (this.content as ContentText).html
    }
    set text_html(html){
        ;(this.content as ContentText).html = html
        void self.app_db.sections.set(this.section)
    }

    modify(){
        // Emit modify event so parent can open a dialog
        this.$emit('modify', this.section)
    }

    remove(){
        // Remove this section (and cause this component to be destroyed)
        void self.app_db.draft_section_remove(this.draft, this.section)
    }

    focus_editor(){
        // If text section is clicked, focus the text area for editing
        // NOTE Normally section's padding would prevent focusing the text area
        if (this.type === 'text'){
            ;(this.$refs['app_html'] as any).focus()  // Accesses private method of AppHtml
        }
    }

    @Watch('content.images', {immediate: true}) async watch_images(){
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

    .respondbar:not(.respondable)
        visibility: hidden

</style>
