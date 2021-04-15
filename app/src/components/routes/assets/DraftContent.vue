
<template lang='pug'>

div.content

    template(v-for='(row, row_i) of floatified_rows')
        draft-add-section.add-before(:draft='draft' :position='row_i')
        div.srow(:class='row.display')
            draft-movebar(:draft='draft' :row_i='row_i')
            div.sections
                template(v-for='section of row.sections')
                    draft-section.section(:key='section.id' :draft='draft' :section='section'
                        @modify='modify_section')
                    draft-section-respond(:key='`respond-${section.id}`' :profile='profile'
                        :section='section')

    draft-add-section.add-end(:draft='draft' :position='draft.sections.length'
        :visible='!draft.sections.length')

    draft-guide(:empty='!draft.sections.length')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DraftGuide from './DraftGuide.vue'
import DraftSection from './DraftSection.vue'
import DraftMovebar from './DraftMovebar.vue'
import DraftAddSection from './DraftAddSection.vue'
import DialogSectionText from '@/components/dialogs/DialogSectionText.vue'
import DialogSectionImages from '@/components/dialogs/DialogSectionImages.vue'
import DialogSectionVideo from '@/components/dialogs/DialogSectionVideo.vue'
import DraftSectionRespond from './DraftSectionRespond.vue'
import {Draft} from '@/services/database/drafts'
import {Section} from '@/services/database/sections'
import {floatify_rows} from '@/shared/shared_functions'
import {Profile} from '@/services/database/profiles'


@Component({
    components: {DraftSection, DraftAddSection, DraftGuide, DraftMovebar, DraftSectionRespond},
})
export default class extends Vue {

    @Prop() draft:Draft
    @Prop() profile:Profile
    @Prop() sections:{[id:string]: Section}

    modify_dialogs = {
        text: DialogSectionText,
        images: DialogSectionImages,
        video: DialogSectionVideo,
    }

    get floatified_rows(){
        // Return rows of sections with actual section records, and display mode for the rows
        return floatify_rows(
            // Convert the section ids to actual sections
            // NOTE Must filter out sections and/or rows when they haven't been loaded from db yet
            this.draft.sections.map(row => {
                return row.map(section => this.sections[section]).filter(s => s)
            }).filter(row => row.length),
        )
    }

    modify_section(section:Section){
        // Open the appropriate modify dialog for this section's type
        // NOTE This method is also accessed by the parent component
        this.$store.dispatch('show_dialog', {
            component: this.modify_dialogs[section.content.type],
            props: {section},
        })
    }
}

</script>


<style lang='sass' scoped>

.content
    position: relative

    .srow

        .movebar
            position: absolute
            margin-left: -$stello_gutter

            &:hover
                opacity: 1 !important
                z-index: 1  // Raise over other movebars when using (needed when they overlap)

            // Hide bar contents rather than bar itself so can still trigger hover
            ::v-deep > *
                visibility: hidden

        &:hover
            .movebar
                opacity: 0.3

                ::v-deep > *
                    visibility: visible

        // Modify display of outlines etc to account for wrapped text technically overlapping floats
        @media (min-width: $stello_full_plus_sidebar)

            &.wrap-left section:nth-child(2)
                border-top-color: #0000
                border-bottom-color: #0000
                border-left-color: #0000

                ::v-deep .medium-editor-placeholder::after
                    // Stop no-text placeholder overlapping left floats
                    left: $stello_float_width + $stello_gutter

            &.wrap-right section:nth-child(2)
                border-top-color: #0000
                border-bottom-color: #0000
                border-right-color: #0000

                ::v-deep .actions
                    // Move actions bar to left of the right float
                    right: $stello_float_width

</style>
