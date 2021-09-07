
<template lang='pug'>

div.root

    div.guide(v-if='show_guide')

        hr

        h1(class='text-h4 text-center mb-5') Editor Guide

        div(class='text-center')
            app-btn(@click='toggle_guide' small color='') Hide

        div(class='text-center mt-6')
            app-svg.decor_compose(name='decor_compose' responsive)

        h2(class='text-h6') The subject
        p Like an email, the subject for each message is not part of the message itself. Readers will see it when they are notified about your message. Don't put anything sensitive in the subject, as it will still be around after your messages expire.
        video(src='@/assets/guides/editor_clips/subject.webm' autoplay loop)


        h2(class='text-h6') Sections
        p Stello organises messages into sections, which can be text #[app-svg(name='icon_subject')], images #[app-svg(name='icon_image')], or videos #[app-svg(name='icon_video')]. This gives several advantages, such as being able to rearrange sections, allow recipients to comment on individual sections, and giving your message a more logical flow. You can still just write one long section if you prefer.
        p Add sections with the #[app-svg(name='icon_add')] menu and customise them with #[app-svg(name='icon_settings')].
        video(src='@/assets/guides/editor_clips/sections.webm' autoplay loop)

        h2(class='text-h6') Responses
        p Readers can #[app-svg(name='icon_chat_bubble_outline')] Comment or #[app-svg(name='icon_thumb_up')] React (with emoji) to each section of your message unless you disable it. You can disable all responses in settings, or individually for each section. All responses are encrypted and private, so only you can see them.
        video(src='@/assets/guides/editor_clips/responses.webm' autoplay loop)

        h2(class='text-h6') Layout
        p Sections are normally displayed one after the other. You can display two sections side-by-side with the #[app-svg(name='icon_section_merge')] button and separate them again with #[app-svg(name='icon_section_separate')], or swap them with #[app-svg(name='icon_swap_horiz')]. Normal text will wrap around whatever content it is placed next to.
        p This only happens on large screens (like computers) where as on small screens (like phones) Stello will automatically revert to a single column format.
        video(src='@/assets/guides/editor_clips/layout.webm' autoplay loop)

        h2(class='text-h6') Formatting &amp; Style
        p There are three main ways to change the style and formatting of text:
        ol
            li Every new line you can either type normal text or create a heading #[app-svg(name='icon_heading')], list #[app-svg(name='icon_list_numbered')], etc
            li Select text to make it bold #[app-svg(name='icon_format_bold')], italic #[app-svg(name='icon_format_italic')], etc
            li Change the text section's settings #[app-svg(name='icon_settings')] to make the whole section standout more or less
        video(src='@/assets/guides/editor_clips/formatting.webm' autoplay loop)
        p(class='note') Stello has intentionally limited styling options. This is because the default style and layout is already designed to be as easy to read as possible. While you may wish to change the font, color, size, alignment etc, these can end up making your message harder to read. Stello automatically changes font size, color, and layout depending on the size of screen (such as phone or desktop) and the preference of the reader. Instead, simply focus on your content and Stello will take care of the rest.

        h2(class='text-h6') Dynamic content
        p Click or type #[app-svg(name='icon_tag')] to add dynamic content (also known as merge fields). A placeholder will be added that will be replaced with the real value when the message is sent. For example, it could be the date of sending, or the contact's name.
        video(src='@/assets/guides/editor_clips/dynamic_content.webm' autoplay loop)

        h2(class='text-h6') Dark mode
        p Your message will appear light or dark depending on the preference of each recipient (defaulting to light). This is important, as reading light messages at night can be blinding, and dark ones during the day can be hard to read.
        p
            | Change the setting for yourself with the
            app-svg(name='icon_brightness_4' class='mx-2')
            | button without affecting your readers.
        video(src='@/assets/guides/editor_clips/dark.webm' autoplay loop)

    p(class='text-center mt-6')
        app-btn(v-if='show_guide' @click='toggle_guide' color='' outlined) Hide guide
        app-btn.reveal(v-else ref='show' icon='help' @click='toggle_guide' data-tip="Editor Guide"
            data-tip-instant)

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    show_guide = false

    created():void{
        this.show_guide = this.$store.state.show_guide_default
    }

    toggle_guide():void{
        this.show_guide = !this.show_guide
        // Once guide has been hidden, never default to showing it again
        if (this.$store.state.show_guide_default){
            this.$store.commit('dict_set', ['show_guide_default', false])
            // Focus the reveal button, triggering tooltip, so user knows how to show again if need
            this.$nextTick(() => {
                ;((this.$refs['show'] as Vue).$el as HTMLButtonElement).focus()
            })
        }
    }

}

</script>


<style lang='sass' scoped>

.root
    margin-top: 100px

    .decor_compose
        max-width: 500px

        ::v-deep path
            fill: currentColor

    .guide

        video
            width: 100%
            margin: 12px 0
            outline: 1px solid #8888

        h2
            margin-top: 36px
            margin-bottom: 12px

        p, li
            svg
                margin: 0 4px
                vertical-align: text-bottom

            &.note
                font-size: 0.8em
                margin-left: 24px
                margin-right: 24px

    .reveal
        opacity: 0.25

        &:hover, &:focus
            opacity: 1


</style>
