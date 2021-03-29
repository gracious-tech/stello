
<template lang='pug'>

transition(name='statusbar' appear)
    div.statusbar(v-if='tasks.length || failure || finished' class='elevation-20')
        div.tasks
            transition(v-if='finished' name='finished' appear)
                div.finished
                    div(class='ellipsis') {{ finished.display }}
                    app-svg(name='icon_done')
            template(v-else-if='tasks.length')
                v-progress-linear(:value='first.percent' :buffer-value='0' color='accent' stream
                    :indeterminate='first.subtasks_total < 2')
                div.active
                    div(class='ellipsis') {{ first.status }}
                    div.other(v-if='tasks.length > 1') +{{ tasks.length - 1 }}
            template(v-else)
                | &nbsp;
        div.fails(v-if='failure' @click='show_fails_dialog' class='app-bg-error')
            app-svg(name='icon_error')
            div(class='ellipsis') Failed: {{ failure }}
            strong(class='ml-4') FIX

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import {Task, task_manager} from '@/services/tasks/tasks'
import DialogTaskFailures from '../dialogs/DialogTaskFailures.vue'


@Component({})
export default class extends Vue {

    finished_queue:Task[] = []  // Queue for tasks yet to fade in/out so user can notice them

    get tasks():Task[]{
        // Get tasks that haven't finished yet
        return task_manager.data.tasks
    }

    get failure():string{
        // Get string describing failed task/tasks if any
        const fails = task_manager.data.fails
        if (fails.length === 0){
            return
        } else if (fails.length === 1){
            return fails[0].display
        }
        return `${fails.length} tasks failed`
    }

    get task_manager_finished():Task{
        // The current finished task (task manager only ever stores last one)
        return task_manager.data.finished
    }

    get finished():Task{
        // The first finished task in queue for brief display
        return this.finished_queue[0]
    }

    get first():Task{
        // Shortcut for the first active task
        return this.tasks[0]
    }

    @Watch('task_manager_finished') watch_finished(task:Task):void{
        // Watch task manager's finished property and store them in queue for brief display
        this.finished_queue.push(task)
        setTimeout(() => {this.finished_queue.shift()}, 4000)
    }

    show_fails_dialog():void{
        // Show dialog for managing task failures
        this.$store.dispatch('show_dialog', {component: DialogTaskFailures})
    }
}

</script>


<style lang='sass' scoped>

$statusbar_height: 40px

.statusbar
    z-index: 20  // Must be higher than sidebar
    display: flex
    height: $statusbar_height
    background-color: #111
    color: white

    .tasks
        flex-grow: 1
        display: flex
        flex-direction: column
        overflow-x: hidden  // Trigger ellipsis for .active when appropriate

        .finished
            display: flex
            align-items: center
            height: 100%
            justify-content: center
            color: $accent_lighter
            padding: 0 12px

            svg
                margin-left: 12px

        .active
            flex-grow: 1
            display: flex
            justify-content: space-between
            align-items: center
            padding-left: 24px
            padding-right: 12px

            .other
                background-color: rgba(#fff, 0.3)
                border-radius: 24px
                min-width: 24px
                min-height: 24px
                font-size: 12px
                display: flex
                justify-content: center
                align-items: center

    .fails
        padding: 0 12px
        display: flex
        align-items: center
        cursor: pointer
        max-width: 50%  // Don't ever take up whole statusbar with failure as looks too serious

        svg
            margin-right: 12px


// Slide up/down animation for statusbar
.statusbar-enter-active, .statusbar-leave-active
    transition: margin-bottom .5s
.statusbar-enter, .statusbar-leave-to
    margin-bottom: -$statusbar_height

// Fade in/out animation for finished tasks
.finished-enter-active, .finished-leave-active
    transition: opacity 1s
.finished-enter, .finished-leave-to
    opacity: 0

</style>
