
<template lang='pug'>

//- NOTE Dialogs have 100% width (up to max) so size doesn't change when fields appear/disappear etc
v-dialog(:value='show' @input='close_detected' :fullscreen='fullscreen' :persistent='persistent'
        scrollable width='100%' :max-width='max_width' :content-class='content_class')
    component(v-if='dialog' :is='dialog.component' v-bind='dialog.props' @close='close_request')

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    show = false
    dialog = null
    timeout = null

    get fullscreen(){
        // Return whether dialog should take up whole screen or leave border
        return this.$store.state.tmp.viewport_width < 500
    }

    get persistent(){
        // If true, dialog cannot be closed by clicking outside it
        return this.dialog?.persistent === true
    }

    get max_width(){
        // Max width of dialog
        return this.dialog?.wide ? '800px' : '600px'
    }

    get content_class():string{
        // Classes to apply to the detached dialog in DOM (normal class attribute doesn't work)
        return this.dialog?.tall === true ? 'tall' : ''
    }

    @Watch('$store.state.tmp.dialog') watch_dialog(value){
        // Handle change or removal of dialog to show

        // If previously set a delayed change to `this.dialog`, prevent it from overriding new value
        if (this.timeout !== null){
            clearTimeout(this.timeout)
            this.timeout = null
        }

        // Should be showing dialog if value isn't null
        this.show = !!value

        // If closing the dialog, delay removal of its contents until closing animation done
        if (this.show){
            this.dialog = value
        } else {
            this.timeout = setTimeout(() => {
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
        if (this.$store.state.tmp.dialog){
            this.$store.state.tmp.dialog.resolve(value)
        }
    }

}

</script>


<style lang='sass'>
// WARN These styles are not scoped, so can still apply despite abnormal insertion into DOM

.v-dialog.tall
    height: 100%  // Actual height is maxed out at e.g. 90%


</style>
