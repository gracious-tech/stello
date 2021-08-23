<!-- The list rendered for Tiptap's mention extension -->


<template lang='pug'>

v-list(dense)
    v-list-item-group(v-model='selected' color='accent')
        v-list-item(v-for='item of items' :key='item.code' @click='execute(item)')
            v-list-item-content
                v-list-item-title {{ item.label }}
            v-list-item-action(v-if='item.value') {{ item.value }}

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'


interface Variable {
    code:string
    label:string
    value:string|null
}


@Component({})
export default class extends Vue {

    @Prop({type: Array, required: true}) items:Variable[]
    @Prop({type: Function, required: true}) command:(arg:{id:string})=>void

    selected = 0

    execute(item:Variable):void{
        // Call the command passed as a prop, providing it with the chosen item's code
        this.command({id: item.code})
    }

    on_keydown({event}:{event:KeyboardEvent}):boolean{
        // Handle keydown events reported by the editor (return true if handled)
        if (event.key === 'ArrowUp'){
            this.selected = ((this.selected + this.items.length) - 1) % this.items.length
        } else if (event.key === 'ArrowDown'){
            this.selected = (this.selected + 1) % this.items.length
        } else if (event.key === 'Enter' && this.selected < this.items.length){
            this.execute(this.items[this.selected])
        } else {
            return false
        }
        return true
    }

    @Watch('items') watch_items(){
        // Go back to start of list whenever it changes
        this.selected = 0
    }

}

</script>


<style lang='sass' scoped>

.v-list
    padding: 0

.v-list-item__action
    font-size: 12px
    opacity: 0.8
    margin-left: 24px

</style>
