
<template lang='pug'>

section

    draft-add-section.add-before(:draft='draft' :position='position')

    //- inner div used to separate content area from add-before button for purposes of hover outline
    div.inner(@click.self='click_inner')
        app-menu-more
            v-list-item(@click='show_modify_dialog' :disabled='!(type in modify_dialogs)')
                v-list-item-icon
                    app-svg(name='icon_edit')
                v-list-item-content
                    v-list-item-title Modify
            v-list-item(@click='move_up' :disabled='is_first')
                v-list-item-icon
                    app-svg(name='icon_arrow_upward')
                v-list-item-content
                    v-list-item-title Move up
            v-list-item(@click='move_down' :disabled='is_last')
                v-list-item-icon
                    app-svg(name='icon_arrow_downward')
                v-list-item-content
                    v-list-item-title Move down
            v-list-item(@click='toggle_half' :disabled='section.is_plain_text')
                v-list-item-icon
                    app-svg(:name='toggle_half_icon')
                v-list-item-content
                    v-list-item-title Half width
            v-list-item(@click='remove' color='error')
                v-list-item-icon
                    app-svg(name='icon_delete')
                v-list-item-content
                    v-list-item-title Remove

        //- NOTE Using v-once so that selection not lost whenever html is saved/updated
        div(v-if='type === "text"' ref='editable' v-html='section.content.html' v-once
            @input='html_changed')

        shared-slideshow(v-if='type === "images"' :images='section.content.images'
            :crop='section.content.crop' editing @click='show_modify_dialog')

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

    get position(){
        // Get position/index of this section in the draft
        return this.draft.sections.indexOf(this.section.id)
    }

    get is_first(){
        // Bool for whether section is first in draft
        return this.position === 0
    }

    get is_last(){
        // Bool for whether section is last in draft
        return this.position === (this.draft.sections.length - 1)
    }

    get toggle_half_icon(){
        // Icon to display for toggle_half button (plain text always wraps)
        if (this.section.is_plain_text){
            return 'section_width_wrap'
        }
        return this.section.half_width ? 'section_width_full' : 'section_width_half'
    }

    get toggle_half_tooltip(){
        // Return text to display for tooltip for toggle half width button
        if (this.section.is_plain_text){
            return "Normal text always wraps around other content"
        }
        return this.section.half_width ? "Expand to full width" : "Reduce to half width"
    }

    move_up(){
        // Move this section up in order
        const prev_section_id = this.draft.sections[this.position - 1]
        this.draft.sections.splice(this.position - 1, 2, this.section.id, prev_section_id)
        self._db.drafts.set(this.draft)
    }

    move_down(){
        // Move this section down in order
        const next_section_id = this.draft.sections[this.position + 1]
        this.draft.sections.splice(this.position, 2, next_section_id, this.section.id)
        self._db.drafts.set(this.draft)
    }

    toggle_half(){
        // Toggle whether section is half width
        this.section.half_width = !this.section.half_width
        self._db.sections.set(this.section)
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

    click_inner(){
        // If inner of standout sections is clicked, focus the text area for editing
        // NOTE Normally inner's padding would prevent focusing the text area
        if (this.type === 'text' && !this.section.is_plain_text){
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
    position: relative  // So that .menu-more-btn will be relative to this

    &.full-wrappable .medium-editor-placeholder::after
        // Stop no-text placeholder overlapping left floats
        left: 55%

    &.half-float ::v-deep .menu-more-btn
        // half-float has right padding to form middle gutter, so don't need the -48px default
        // WARN Only apply when not in single-col layout
        @media (min-width: $stello_full_width)
            right: 0px

    .inner:hover, .inner:focus-within
        // Show an outline over sections content whenever hover or focused inside
        outline-width: 2px
        outline-style: dashed
        outline-color: rgba($accent, 0.2)
        outline-offset: 2px

        .medium-editor-element
            // Don't show default white outline as will show outline around whole section instead
            outline-style: none

    .add-before
        // Show add-before toolbar in gap between sections
        display: inline-block  // Become affected by text wrapping, so centered when next to float
        position: absolute
        margin-left: -48px
        margin-top: -48px
        z-index: 1  // Ensure button clickable despite prev float section's padding overlapping

    ::v-deep .menu-more-btn
        // Show options menu for section in right gutter
        position: absolute
        top: 48px
        right: -48px

        &:not(:hover)
            // Make subtle when not hovered
            opacity: 0.15


</style>
