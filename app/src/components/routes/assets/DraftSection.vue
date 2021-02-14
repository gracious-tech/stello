
<template lang='pug'>

section(@click.self='focus_editor' :class='classes')

    div.actions
        app-btn(icon='settings' @click='show_modify_dialog' :disabled='!(type in modify_dialogs)')
        app-btn(icon='delete' @click='remove' color='error')

    div.inner(@click.self='focus_editor')
        //- NOTE Using v-once so that selection not lost whenever html is saved/updated
        div(v-if='type === "text"' ref='editable' v-html='section.content.html' v-once
            @input='html_changed')
        //- Add a clear div if plain so node (and border) extends same height as adjacent float
        div(v-if='section.is_plain_text' style='clear:both')
        shared-slideshow(v-if='type === "images"' :images='section.content.images'
            :crop='section.content.crop' editing @img_click='show_modify_dialog')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DraftAddSection from './DraftAddSection.vue'
import SharedSlideshow from '@/shared/SharedSlideshow.vue'
import DialogSectionText from '@/components/dialogs/DialogSectionText.vue'
import DialogSectionImages from '@/components/dialogs/DialogSectionImages.vue'
import {activate_editor, debounce_method} from '@/services/misc'
import {Section} from '@/services/database/sections'
import {Draft} from '@/services/database/drafts'
import {ContentText} from '@/services/database/types'
import {section_classes} from '@/shared/shared_functions'


@Component({
    components: {DraftAddSection, SharedSlideshow},
})
export default class extends Vue {

    @Prop() draft:Draft
    @Prop() section:Section

    deactivate_editor
    modify_dialogs = {
        text: DialogSectionText,
        images: DialogSectionImages,
    }

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

    get type(){
        return this.section.content.type
    }

    get classes(){
        // Return classes for the section
        return section_classes(this.section)
    }

    @debounce_method() html_changed(event){
        // Save html whenever it changes for text types
        (this.section.content as ContentText).html = event.target.innerHTML
        self._db.sections.set(this.section)
    }

    show_modify_dialog(){
        // Open the appropriate modify dialog for this section's type
        this.$store.dispatch('show_dialog', {
            component: this.modify_dialogs[this.type],
            props: {section: this.section},
        })
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

@import '@/shared/shared_mixins'


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

</style>
