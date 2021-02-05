
<template lang='pug'>

div.content
    template(v-for='(section_id, i) of draft.sections')

        draft-section.section(v-if='sections[section_id]' :key='section_id' :draft='draft'
            :section='sections[section_id]' :class='section_classes[i]')

        //- Clearing on sections themselves usually isn't enough so must insert empty div
        //- Only time when shouldn't clear after a section is after a half-float (on left)
        //- WARN Update sent message rendering if this changes
        div(v-if='!section_classes[i].includes("half-float")' style='clear: left')

    draft-add-section.add-end(:draft='draft' :position='draft.sections.length'
        :visible='!draft.sections.length')

    draft-guide(:empty='!draft.sections.length')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DraftGuide from './DraftGuide.vue'
import DraftSection from './DraftSection.vue'
import DraftAddSection from './DraftAddSection.vue'
import {get_section_classes} from '@/services/misc'
import {Draft} from '@/services/database/drafts'
import {Section} from '@/services/database/sections'


@Component({
    components: {DraftSection, DraftAddSection, DraftGuide},
})
export default class extends Vue {

    @Prop() draft:Draft
    @Prop() sections:{[id:string]: Section}

    get section_classes(){
        // Automatically determine appropriate display classes for sections based on their positions
        const sections_data = this.draft.sections.map(id => this.sections[id])
        return get_section_classes(sections_data)
    }
}

</script>


<style lang='sass' scoped>

.content
    .add-end
        clear: both
        position: relative
        left: -48px

</style>
