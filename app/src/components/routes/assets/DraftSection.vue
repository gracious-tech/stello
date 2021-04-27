
<template lang='pug'>

section(@click.self='focus_editor' :class='classes')

    div.actions
        app-btn(icon='settings' @click='modify')
        app-btn(icon='delete' @click='remove' color='error')

    div.inner(@click.self='focus_editor')

        //- NOTE Using v-once so that selection not lost whenever html is saved/updated
        div(v-if='type === "text"' ref='editable' v-html='content.html' v-once
            @input='html_changed')

        shared-slideshow(v-if='type === "images"' :images='content.images'
            :crop='content.crop' editing @img_click='modify')

        shared-video(v-if='type === "video"' @modify='modify' :format='content.format'
            :id='content.id' :start='content.start' :end='content.end')

    draft-section-respond(:profile='profile' :section='section')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DraftAddSection from './DraftAddSection.vue'
import DraftSectionRespond from './DraftSectionRespond.vue'
import SharedVideo from '@/shared/SharedVideo.vue'
import SharedSlideshow from '@/shared/SharedSlideshow.vue'
import {activate_editor, debounce_method} from '@/services/misc'
import {Section} from '@/services/database/sections'
import {Draft} from '@/services/database/drafts'
import {ContentText} from '@/services/database/types'
import {section_classes} from '@/shared/shared_functions'
import {Profile} from '@/services/database/profiles'


@Component({
    components: {DraftAddSection, DraftSectionRespond, SharedSlideshow, SharedVideo},
})
export default class extends Vue {

    @Prop() draft:Draft
    @Prop() profile:Profile
    @Prop() section:Section

    deactivate_editor

    mounted(){
        // Activate contenteditable editor if a text section
        if (this.type === 'text'){
            this.deactivate_editor = activate_editor(this.$refs.editable)
        }
    }

    destroyed(){
        // Deactivate editor if present, otherwise will keep a node reference forever
        if (this.deactivate_editor){
            this.deactivate_editor()
        }
    }

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

    @debounce_method() html_changed(event){
        // Save html whenever it changes for text types
        ;(this.content as ContentText).html = event.target.innerHTML
        self._db.sections.set(this.section)
    }

    modify(){
        // Emit modify event so parent can open a dialog
        this.$emit('modify', this.section)
    }

    remove(){
        // Remove this section (and cause this component to be destroyed)
        self._db.draft_section_remove(this.draft, this.section)
    }

    focus_editor(){
        // If text section is clicked, focus the text area for editing
        // NOTE Normally section's padding would prevent focusing the text area
        if (this.type === 'text'){
            (this.$refs.editable as HTMLElement).focus()
            // Move cursor to end of editable region (default is to position before first char)
            self.document.getSelection().modify('move', 'forward', 'documentboundary')
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
        border-color: rgba($primary, 0.4)

        .medium-editor-element
            // Don't show default white outline as will show outline around whole section instead
            outline-style: none

    &:focus-within
        border-color: rgba($accent, 0.4)

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
