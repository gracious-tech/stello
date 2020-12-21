
<template lang='pug'>

div.root(:class='{showing: show_guide}')

    app-svg.decor_compose(v-if='show_decor' @click='toggle_guide' name='decor_compose')

    div.guide(v-if='show_guide')

        h1(class='text-h4 text-center mb-5') Writing Guide

        app-svg.decor_compose_guide(name='decor_compose')

        h2(class='text-h6') The subject
        p Like an email, the subject for each message is not part of the message itself. Readers will see it when they are notified about your message. Don't put anything sensitive in the subject, as it will still be around after your messages expire.

        h2(class='text-h6') Compartmentalise
        p Stello organises messages into sections, which can be text, images, or other media. This gives several advantages, such as being able to rearrange sections, allow recipients to comment on individual sections, and will be easier to read too. You can still just write one long section if you prefer.

        p
            | Add sections with
            app-svg(name='icon_add' class='mx-2')
            | and change their settings with
            app-svg(name='icon_more_vert' class='mx-2')

        h2(class='text-h6') Automatic layout
        p Stello keeps sections in order, but you can make some half-width and Stello will put them next to each other, or flow text around them. Stello will automatically adjust the layout when displayed on phones and other small screens.

        h2(class='text-h6') Lights out
        p Your message will appear light or dark depending on the preference of each recipient (defaulting to light). This is important, as reading light messages at night can be blinding, and dark ones during the day can be hard to read.
        p
            | Change the setting for yourself with the
            app-svg(name='icon_invert_colors' class='mx-2')
            | button without affecting your readers.

    p(class='text-center mt-6')
        app-btn.toggle(@click='toggle_guide' color='' :small='!show_guide')
            | {{ show_guide ? "Hide guide" : "Show guide" }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop(Boolean) empty:boolean
    show_guide = false

    created(){
        // Show guide for first time, otherwise ensure default to not
        if (this.$store.state.show_guide_default){
            this.show_guide = true
            this.$store.commit('dict_set', ['show_guide_default', false])
        }
    }

    get show_decor(){
        return this.empty && !this.show_guide
    }

    toggle_guide(){
        this.show_guide = !this.show_guide
    }

}

</script>


<style lang='sass' scoped>

.root
    margin-top: 100px

    .decor_compose, .decor_compose_guide
        display: block
        width: 100%
        height: auto

        ::v-deep path
            fill: currentColor

    .decor_compose
        max-width: 400px
        margin-left: auto
        margin-right: auto
        opacity: 0.5
        cursor: pointer

    .decor_compose_guide
        max-width: 300px
        margin-top: 120px
        margin-bottom: 80px
        margin-right: 48px
        float: left

    .guide
        opacity: 0.8

        h2
            margin-top: 36px
            margin-bottom: 12px

    .toggle
        font-family: Roboto


    &:not(.showing) .toggle
        opacity: 0.15

        &:hover
            opacity: 1


</style>
