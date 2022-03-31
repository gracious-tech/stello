
<template lang='pug'>

div.content

    template(v-for='(row, row_i) of floatified_rows')
        draft-add-section.add-before(v-if='row_i > 0 || !row.hero'
            @add='add_section($event, row_i)')
        div.srow(:class='{[row.display]: true, hero: row.hero}')
            draft-movebar(:sections='sections' :row_i='row_i' @save='save_sections')
            div.sections
                draft-section.section(v-for='section of row.sections' :key='section.id'
                    :draft='draft' :profile='profile' :section='section'
                    :first_hero='row_i === 0 && row.hero'
                    @modify='modify_section' @remove='remove_section')

    draft-add-section.add-end(@add='add_section($event, sections.length)'
        :visible='!sections.length')

    draft-guide

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DraftGuide from './DraftGuide.vue'
import DraftSection from './DraftSection.vue'
import DraftMovebar from './DraftMovebar.vue'
import DraftAddSection from './DraftAddSection.vue'
import DialogSectionText from '@/components/dialogs/DialogSectionText.vue'
import DialogSectionImages from '@/components/dialogs/DialogSectionImages.vue'
import DialogSectionVideo from '@/components/dialogs/DialogSectionVideo.vue'
import {Draft} from '@/services/database/drafts'
import {Section} from '@/services/database/sections'
import {floatify_rows} from '@/shared/shared_functions'
import {Profile} from '@/services/database/profiles'
import {RecordSectionContent, SectionIds} from '@/services/database/types'
import {rm_section_id} from '@/services/database/utils'


@Component({
    components: {DraftSection, DraftAddSection, DraftGuide, DraftMovebar},
})
export default class extends Vue {

    @Prop({required: true, type: Draft}) declare readonly draft:Draft
    @Prop({required: true, type: Array}) declare readonly sections:SectionIds
    @Prop({default: undefined}) declare readonly profile:Profile|undefined

    records:Record<string, Section> = {}  // Content of section records
    records_inited = false

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
            this.sections.map(row => {
                return row.map(section => this.records[section])
                    .filter(s => s) as [Section]|[Section, Section]
            }).filter(row => row.length),
        )
    }

    get_existing_images(){
        // Return existing images used within sections (doesn't traverse pages)
        // WARN This method is accessed by sibling components like DraftInvite
        const images:Blob[] = []
        for (const section of Object.values(this.records)){
            if (section.content.type === 'images'){
                images.push(...section.content.images.map(i => i.data))
            } else if (section.content.type === 'page' && section.content.image){
                images.push(section.content.image)
            }
        }
        return images
    }

    async add_section(type:RecordSectionContent['type'], position:number){
        // Create the section and then add it (in correct position) to draft in a new row
        const section = await self.app_db.sections.create(type)
        this.sections.splice(position, 0, [section.id])
        this.save_sections()
    }

    modify_section(section:Section){
        // Open the appropriate modify dialog for this section's type
        // NOTE This method is also accessed by the parent component
        if (section.content.type === 'page'){
            // NOTE Must use raw path since '*' can't be captured via params in Router v3
            void this.$router.push(`./${section.id}/`)
        } else {
            void this.$store.dispatch('show_dialog', {
                component: this.modify_dialogs[section.content.type],
                props: {section, profile: this.profile},
                wide: section.content.type === 'images',
            })
        }
    }

    async remove_section(section:Section){
        // Remove the given section
        rm_section_id(this.sections, section.id)
        this.save_sections()
        await self.app_db.sections.remove(section.id)
        delete this.records[section.id]  // Rm from cache
    }

    save_sections(){
        // Tell draft/page to save changes to sections
        this.$emit('save')
    }

    @Watch('sections', {immediate: true}) watch_sections(){
        // Fetch section data for any sections that haven't been fetched yet (on init and create)

        // Cache records_inited so stays same throughout this call
        const cached_records_inited = this.records_inited
        this.records_inited = true

        // Process each section id
        this.sections.flat().forEach(async section_id => {

            // Ignore section if data already obtained as only interested in creation events
            // NOTE Changes to sections are made to section objects directly, not refetched from db
            if (section_id in this.records){
                return
            }

            // Get the section's data and add to records object
            const section_data = (await self.app_db.sections.get(section_id))!
            Vue.set(this.records, section_id, section_data)

            // If just created a new section, open modify dialog straight away (unless text)
            // NOTE Have to use same instance of section data, otherwise lose reactivity
            //      Which is why must handle here since its the origin of the section instance
            if (cached_records_inited && section_data.content.type !== 'text'){
                this.modify_section(section_data)
            }
        })
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.content
    position: relative

    .srow

        .movebar
            position: absolute
            margin-left: -$stello_gutter
            z-index: 10  // Raise above section content so can show tooltips over them

            &:hover
                opacity: 1 !important
                z-index: 10 + 1  // Raise over other movebars when using (needed when they overlap)

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

            &.wrap-right section:nth-child(2)
                border-top-color: #0000
                border-bottom-color: #0000
                border-right-color: #0000

                ::v-deep .actions
                    // Move actions bar to left of the right float
                    right: $stello_float_width

        &.hero
            // Make toolbars overlap hero since no gutter available
            .movebar
                margin-left: 0
            ::v-deep .actions
                right: 0
            // Give toolbars a background when modifying a hero as will be displayed overlapping it
            &:hover .movebar
                @include stello_themed(background-color, white, black)
                border-radius: 24px
            ::v-deep section:hover .actions
                @include stello_themed(background-color, white, black)
                border-radius: 24px
            // Hero can be clicked to modify when in editor
            ::v-deep section svg
                cursor: pointer

</style>
