
<template lang='pug'>

div(v-if='tasks.length')
    v-progress-linear(:value='percent' :buffer-value='0' :indeterminate='first.subtasks_total < 2'
        color='accent' stream)
    div.statuses
        div.first {{ first.status }}
        div.other
            //- Only show up to 2 others (highly unlikely to have more than 3 tasks at same time)
            template(v-for='task of tasks.slice(1, 3)')
                | {{ task.status }}
                <br>

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    get tasks(){
        // Get tasks that haven't finished yet
        return this.$store.getters.active_tasks
    }

    get first(){
        // Shortcut for the first task
        return this.tasks[0]
    }

    get percent(){
        // Work out percentage complete as the progress bar works on percentages
        return Math.floor(this.first.subtasks_done / this.first.subtasks_total * 100)
    }
}

</script>


<style lang='sass' scoped>

.statuses
    background-color: $primary_darker
    color: $on_primary_darker
    display: flex
    justify-content: space-between
    align-items: center
    height: 40px
    padding: 0 36px

    .other
        font-size: 0.7em
        max-height: 40px
        overflow: hidden

</style>
