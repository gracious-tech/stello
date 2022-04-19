
<template lang='pug'>

v-card

    v-card-title(class='mb-2') Select contacts you received a rejection email for
    v-card-subtitle
        | The following shows contacts who were sent an email but didn't open it yet.
        | Only select the ones you received a rejection email for where the problem was a sending
        | limit (to avoid sending duplicates).

    v-card-text
        app-content-list(v-if='show_list' :items='copies_ui' height='48')
            template(#default='{item, height_styles}')
                v-list-item(:key='item.copy.id' :class='item.selected ? "accent--text" : ""'
                        :style='height_styles' @click='item.selected = !item.selected')
                    v-list-item-action
                        app-svg(:name='`icon_checkbox_${item.selected}`')
                    v-list-item-content
                        v-list-item-title {{ item.copy.display }}
                    v-list-item-content
                        v-list-item-title {{ item.copy.contact_address }}

    v-card-actions
        div.bulk(@click='toggle_all')
            app-btn-checkbox(:value='bulk_value')
            span(class='noselect') SELECT ALL
        v-spacer
        app-btn(@click='close') Cancel
        app-btn(@click='apply') Mark as unsent

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {MessageCopy} from '@/services/database/copies'


@Component({})
export default class extends Vue {

    @Prop({type: Array, required: true}) declare readonly copies:MessageCopy[]

    copies_ui:{copy:MessageCopy, selected:boolean}[] = []
    show_list = false

    created(){
        // Populate reactive array that attaches selected property to each copy
        this.copies_ui = this.copies.map(copy => ({
            copy,
            selected: false,
        }))
    }

    mounted(){
        // A hack to fix issue where virtual scroll list doesn't show when parent first mounted
        this.$nextTick(() => {
            this.show_list = true
        })
    }

    get all_selected(){
        // Whether all have been selected
        return !!this.copies_ui.length && this.copies_ui.every(i => i.selected)
    }

    get bulk_value(){
        // What value the bulk select checkbox should display as
        return this.all_selected ? true : (this.copies_ui.some(i => i.selected) ? null : false)
    }

    toggle_all(){
        // Toggle whether all are selected or none are
        const value_for_all = !this.all_selected
        for (const item of this.copies_ui){
            item.selected = value_for_all
        }
    }

    apply(){
        // Set invited to null for all selected copies
        for (const item of this.copies_ui){
            if (item.selected){
                item.copy.invited = null
                void self.app_db.copies.set(item.copy)
            }
        }
        this.close()
    }

    close(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

.bulk
    cursor: pointer

</style>
