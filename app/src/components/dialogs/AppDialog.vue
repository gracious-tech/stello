
<template lang='pug'>

v-dialog(:value='show' @input='close_detected' :fullscreen='fullscreen' :persistent='persistent'
        scrollable)
    component(v-if='dialog' :is='dialog.component' v-bind='dialog.props' @close='close_request')

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    show = false
    dialog = null

    get fullscreen(){
        // Return whether dialog should take up whole screen or leave border
        return this.$store.state.tmp.viewport_width < 500
    }

    get persistent(){
        // If true, dialog cannot be closed by clicking outside it
        return this.dialog?.persistent === true
    }

    @Watch('$store.state.tmp.dialog') watch_dialog(value){
        // Handle change or removal of dialog to show
        this.show = !!value
        if (this.show){
            // Showing a new dialog so switch straight away
            this.dialog = value
        } else {
            // Closing an existing dialog so delay to allow closing animation
            setTimeout(() => {
                this.dialog = value
            }, 500)
        }
    }

    close_detected(){
        // The Vuetify dialog has been closed by user
        if (this.$store.state.tmp.dialog){
            // The dialog state still exists so user probably clicked outside dialog
            this.$store.state.tmp.dialog.resolve()
        }
    }

    close_request(value:any){
        // The mounted dialog has requested to be closed and resolved with the given value
        this.$store.state.tmp.dialog.resolve(value)
    }

}

</script>


<style lang='sass' scoped>


</style>
