
<template lang='pug'>

div.movebar

    app-btn(icon='arrow_upward' @click='move_up' :disabled='is_first')

    app-btn(@click='toggle_merge' :icon='toggle_merge_icon' :disabled='!is_merged && !mergable'
        :data-tip='toggle_merge_tooltip' data-tip-instant)

    app-btn(v-if='is_merged' icon='swap_horiz' @click='swap' data-tip="Swap positions"
        data-tip-instant)

    app-btn(icon='arrow_downward' @click='move_down' :disabled='is_last')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({required: true, type: Array}) declare readonly sections:([string]|[string, string])[]
    @Prop({required: true, type: Number}) declare readonly row_i:number

    get row(){
        // Get actual row (single or double item array of section ids)
        return this.sections[this.row_i]!
    }

    get is_merged(){
        // Whether row has merged two sections into itself
        return this.row.length === 2
    }

    get is_first(){
        // Bool for whether section is first in draft
        return this.row_i === 0
    }

    get is_last(){
        // Bool for whether section is last in draft
        return this.row_i === (this.sections.length - 1)
    }

    get mergable(){
        // Whether row can be merged with the one above it
        return !this.is_first && this.sections[this.row_i-1]!.length === 1
    }

    get toggle_merge_icon(){
        return this.is_merged ? 'section_separate' : 'section_merge'
    }

    get toggle_merge_tooltip(){
        // Tooltip to display when hovering over merge button
        return this.is_merged ? "Separate sections" : "Put next to section above"
    }

    move_up(){
        // Move row up in order
        const prev_row = this.sections[this.row_i - 1]!
        this.sections.splice(this.row_i - 1, 2, this.row, prev_row)
        this.$emit('save')
    }

    move_down(){
        // Move row down in order
        const next_section_id = this.sections[this.row_i + 1]!
        this.sections.splice(this.row_i, 2, next_section_id, this.row)
        this.$emit('save')
    }

    toggle_merge(){
        // Join/separate sections
        if (this.is_merged){
            this.sections.splice(this.row_i, 1, [this.row[0]], [this.row[1]!])
        } else {
            const prev_row_i = this.row_i - 1
            const prev_row = this.sections[prev_row_i]!
            this.sections.splice(this.row_i-1, 2, [prev_row[0], this.row[0]])
        }
        this.$emit('save')
    }

    swap(){
        // Swap sections that have been merged
        this.row.splice(0, 2, this.row[1]!, this.row[0])
        this.$emit('save')
    }

}

</script>


<style lang='sass' scoped>

.movebar
    display: flex
    flex-direction: column

[data-tip]::after
    // Position tooltip on right of button as can't show above left sidebar
    top: auto !important
    left: 60px

</style>
