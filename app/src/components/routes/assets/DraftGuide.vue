
<template lang='pug'>

div.root(:class='{showing: show_guide}')

    app-svg.decor_compose(v-if='show_decor' @click='toggle_guide' name='decor_compose')

    div.guide(v-if='show_guide')

        h1(class='text-h4 text-center mb-5') Writing Guide

        h2(class='text-h6') The subject
        p Like an email, the subject for each message is not part of the message itself. Readers will see it when they are notified about your message. Don't put anything sensitive in the subject, as it will still be around after your messages expire.

        app-svg.decor_compose_guide(name='decor_compose')

        h2(class='text-h6') Sections
        p Stello organises messages into sections, which can be text #[app-svg(name='icon_subject')], images #[app-svg(name='icon_image')], or videos #[app-svg(name='icon_video')]. This gives several advantages, such as being able to rearrange sections, allow recipients to comment on individual sections, and giving your message a more logical flow. You can still just write one long section if you prefer.

        p Add sections with the #[app-svg(name='icon_add')] menu and customise them with #[app-svg(name='icon_settings')].

        h2(class='text-h6') Layout
        p Sections are normally displayed one after the other. You can display two sections side-by-side with the #[app-svg(name='icon_section_merge')] button and separate them again with #[app-svg(name='icon_section_separate')], or swap them with #[app-svg(name='icon_swap_horiz')]. Normal text will wrap around whatever content it is placed next to.
        p This only happens on large screens (like computers) where as on small screens (like phones) Stello will automatically revert to a single column format.

        h2(class='text-h6') Styling
        p Customise the style of text by selecting the words you wish to change and then styling options will appear. You can also make whole text sections standout more (or less) via the #[app-svg(name='icon_settings')] settings.
        p(class='note') Stello has intentionally limited styling options. This is because the default style and layout is already designed to be as easy to read as possible. While you may wish to change the font, color, size, alignment etc, these can end up making your message harder to read. Stello automatically changes font size, color, and layout depending on the size of screen (such as phone or desktop) and the preference of the reader. Instead, simply focus on your content and Stello will take care of the rest.

        h2(class='text-h6') Dark mode
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

        p
            svg
                margin: 0 4px
                vertical-align: text-bottom

            &.note
                font-size: 0.8em
                margin-left: 24px
                margin-right: 24px

    .toggle
        font-family: Roboto


    &:not(.showing) .toggle
        opacity: 0.15

        &:hover
            opacity: 1


</style>
