
<template lang='pug'>

//- Replacing div.content with transition-group to avoid an additional level of nesting
//- Must then key draft-add-section and draft-guide but appears to be harmless
transition-group(name='trans-up' tag='div' class='content')

    template(v-for='(row, row_i) of floatified_rows')
        draft-add-section.add-before(v-if='row_i > 0 || !row.hero' :key='row.id + "add"'
            @add='add_section($event, row_i)')
        div.srow(:key='row.id + "srow"' :class='{[row.display]: true, hero: row.hero}')
            draft-movebar(:sections='sections' :row_i='row_i' @save='save_sections')
            div.sections
                draft-section.section(v-for='section of row.sections' :key='section.id'
                    :draft='draft' :profile='profile' :section='section'
                    :first_hero='row_i === 0 && row.hero'
                    @modify='modify_section' @remove='remove_section')

    draft-add-section.add-end(key='add' @add='add_section($event, sections.length)'
        :visible='!sections.length')

    draft-guide(key='guide')

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
import DialogSectionChart from '@/components/dialogs/DialogSectionChart.vue'
import DialogSectionFiles from '@/components/dialogs/DialogSectionFiles.vue'
import {Draft} from '@/services/database/drafts'
import {Section} from '@/services/database/sections'
import {floatify_rows} from '@/shared/shared_functions'
import {Profile} from '@/services/database/profiles'
import {RecordSection, RecordSectionContent, SectionIds} from '@/services/database/types'
import {rm_section_id} from '@/services/database/utils'


@Component({
    components: {DraftSection, DraftAddSection, DraftGuide, DraftMovebar},
    inject: ['theme_style_props'],
})
export default class extends Vue {

    declare readonly theme_style_props:Record<string, string>  // Injected

    @Prop({required: true, type: Draft}) declare readonly draft:Draft
    @Prop({required: true, type: Array}) declare readonly sections:SectionIds
    @Prop({default: undefined}) declare readonly profile:Profile|undefined

    records:Record<string, Section> = {}  // Content of section records

    modify_dialogs = {
        text: DialogSectionText,
        images: DialogSectionImages,
        video: DialogSectionVideo,
        chart: DialogSectionChart,
        files: DialogSectionFiles,
    }

    created(){
        // Fetch all section data
        this.sections.flat().forEach(async section_id => {
            const section_data = (await self.app_db.sections.get(section_id))!
            Vue.set(this.records, section_id, section_data)
        })
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

    @Watch('floatified_rows') watch_floatified_rows(){
        // Cleanup transition classes whenever rows change
        setTimeout(() => {this.cleanup_transitions()}, 350)  // Transition finishes after 300
        setTimeout(() => {this.cleanup_transitions()}, 2000)  // Backup, just in case
    }

    cleanup_transitions(){
        // Something causes Vue to not remove trans-up-enter-to class when transition finishes
        // See https://github.com/vuejs/vue/issues/8785
        // It only happens when trans-up-move has a transition, but it's too helpful to disable
        // So instead, call this manually after transition finishes
        for (const element of this.$el.querySelectorAll('.trans-up-enter-to')){
            element.classList.remove('trans-up-enter-to')
        }
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

    async add_section(type:RecordSectionContent['type']|'paste', position:number){
        // Add a new section

        // Create (or paste) the section
        let section:Section
        if (type === 'paste'){
            for (const section of this.$store.state.tmp.cut_section){
                await self.app_db.sections.set(section)
            }
            section = new Section(this.$store.state.tmp.cut_section[0] as RecordSection)
            this.$store.commit('tmp_set', ['cut_section', null])
        } else {
            section = await self.app_db.sections.create(type)
        }

        // Make the section's data available in records cache
        Vue.set(this.records, section.id, section)

        // Add section (in correct position) to draft in a new row
        this.sections.splice(position, 0, [section.id])
        this.save_sections()

        // If just created a new section, open modify dialog straight away (unless text)
        // WARN Careful to always pass same instance of record as is in this.records
        if (type !== 'paste' && type !== 'text'){
            this.modify_section(section)
        }
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
                props: {
                    section,
                    profile: this.profile,
                    // Dialog not a child so can't inject and must pass explicitly
                    theme_style_props: this.theme_style_props,
                },
                wide: section.content.type === 'images',
            })
        }
    }

    async remove_section(section:Section){
        // Remove the given section
        rm_section_id(this.sections, section.id)
        this.save_sections()
        const removed_sections = await self.app_db.sections.remove(section.id)
        this.$store.commit('tmp_set', ['cut_section', removed_sections])
        delete this.records[section.id]  // Rm from cache
    }

    save_sections(){
        // Tell draft/page to save changes to sections
        this.$emit('save')
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
