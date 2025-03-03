
<template lang='pug'>

app-content(class='pa-3 pt-16 text-center')

    h1(class='text-h2 mb-3') Closing...

    p Will close when remaining tasks have finished.

    v-alert(v-if='first' color='primary' class='mt-16')
        h3(class='mb-4 text-body-1 font-italic') {{ first.status }}
        //- Same progress bar as AppStatus but not as detailed regarding other tasks
        v-progress-linear(:value='first.percent' :buffer-value='0' color='accent' stream
            :indeterminate='first.subtasks_total < 2 || !!first.aborted')

    div(class='mt-16 mb-4')
        app-btn(@click='cancel' class='mr-4') Cancel
        app-btn(@click='force' color='warning') Force Quit

    p(class='text-body-2 font-italic warning--text') Force quitting can result in data loss

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import {task_manager} from '@/services/tasks/tasks'


@Component({})
export default class extends Vue {

    get first(){
        // The first task in the list
        return task_manager.data.tasks[0]
    }

    cancel(){
        this.$store.commit('tmp_set', ['closing', false])
    }

    force(){
        this.$store.commit('tmp_set', ['closing', 'force'])
        self.close()
    }
}

</script>


<style lang='sass' scoped>


</style>
