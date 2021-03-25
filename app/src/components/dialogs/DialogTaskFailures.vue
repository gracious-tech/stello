
<template lang='pug'>

v-card

    v-card-title(class='mb-4') Failed tasks

    v-card-text
        dialog-task-failures-item(v-for='task of fails' :task='task' @close='dismiss')

    v-card-actions
        app-btn(@click='dismiss') Close

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import DialogTaskFailuresItem from './assets/DialogTaskFailuresItem.vue'


@Component({
    components: {DialogTaskFailuresItem},
})
export default class extends Vue {

    get fails(){
        return this.$tm.data.fails
    }

    @Watch('fails') watch_fails(){
        // If fails ever becomes empty (e.g. issue fixed), close the dialog
        if (!this.fails.length){
            this.dismiss()
        }
    }

    dismiss(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>


</style>
