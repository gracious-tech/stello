
<template lang='pug'>

section.section_logo
    div(class='block')
        h1.stello_logo
            app-logo
        a(href='https://gracious.tech')
            gracious-logo.gt_logo

        h2.subtitle A new way to send newsletters <br>that are <span>secure</span> &amp; <span>interactive</span>

        a(href='/guide/' class='btn outline') GET STELLO


section.section_example

    div(class='block')

        h3 Example Email
        example-invite.invite
        p Recipients click the button to open the message. This allows them to be encrypted, interactive, and expire (which is not possible with regular emails). The image and text is fully customisable.


section.section_video
    video(src='@/.assets/root/video.mp4' autoplay muted playsinline controls @click='unmute')


section.section_overview
    div(class='block')
        h3 Why is it special?
        div.points
            div.decor
                decor-overview
            div.simple
                h2
                    icon-simple(class='icon')
                    | Simple
                p Automatic layout &amp; styling
            div.secure
                h2
                    icon-secure(class='icon')
                    | Secure
                p Encryption &amp; expiry
            div.stylish
                h2
                    icon-stylish(class='icon')
                    | Stylish
                p Modern &amp; interactive
            div.sending
                h2
                    icon-sending(class='icon')
                    | Sending
                p Less likely to go to spam


section.section_cost
    div(class='block')
        h3 How much does it cost?
        p
            strong It doesn't.
        p
            a(href='https://gracious.tech/donate') Thanks to some awesome people


section.section_quotes
    div(class='block')
        div
            h3 What users say...
            blockquote “It’s so quick and easy to send our news”
            blockquote “we have received way more return messages than ever before”
        div
            h3 What readers say...
            blockquote “Love it! This is so easy to read”
            blockquote “I think this is by far one of the best newsletters that I've ever read.”


section.section_more

    div(class='block')
        a(href='/guide/' class='btn') LEARN MORE


</template>


<script lang='ts'>

import {ref} from 'vue'
import IconSecure from 'md-icon-svgs/lock.svg'
import IconStylish from 'md-icon-svgs/color_lens.svg'
import IconSending from 'md-icon-svgs/send.svg'
import IconDownload from 'md-icon-svgs/get_app.svg'

import AppLogo from '@/.assets/root/logo.svg'
import GraciousLogo from '@/.assets/root/gt_logo.svg'
import DecorOverview from '@/.assets/root/decor_overview.svg'
import IconSimple from '@/.assets/root/icon_next_plan.svg'
import ExampleInvite from '@/.comp/ExampleInvite.vue'


export default {
    components: {AppLogo, IconDownload, IconSimple, IconSecure, IconStylish, IconSending,
        ExampleInvite, GraciousLogo, DecorOverview},
    setup(){
        const unmute = (event:Event) => {
            const video_el = event.target as HTMLVideoElement
            if (video_el.muted){
                video_el.muted = false
                event.preventDefault()
            }
        }
        return {unmute}
    }
}

</script>


<style lang='sass' scoped>

section
    background-color: #222
    color: white

.block
    box-sizing: border-box
    max-width: 800px
    margin: 0 auto
    padding-left: 18px
    padding-right: 18px
    padding-top: 80px
    padding-bottom: 80px

a:not(.btn)
    color: inherit
    text-decoration: underline

h3
    font-size: 26px
    text-align: center
    margin-top: 0
    margin-bottom: 60px
    border-bottom: 2px solid rgba(#fff, 0.2)
    padding-bottom: 0.5em


.section_logo
    background-color: var(--primary)
    color: white
    padding-top: 80px
    padding-bottom: 80px

    .block
        display: flex
        flex-direction: column
        align-items: center

        .stello_logo
            width: 100%
            text-align: center
            margin: 0

            :deep(svg)
                width: 100%
                height: auto
                max-width: 600px

                // Make greek appear on hover
                #greek
                    transition: opacity 1s ease-out
                &:not(:hover) #greek
                    opacity: 0

        .gt_logo
            width: 150px


        .subtitle
            font-size: 30px
            text-align: center
            font-weight: 300
            margin: 50px 0
            line-height: 1.5
            border-bottom-style: none

            span
                font-weight: bold  // Want proper bold


.section_cost
    background-color: #c2185b
    color: white
    text-align: center


.section_video
    video
        width: 100%
        display: block
        cursor: pointer


.section_overview

    .points
        text-align: center

        .decor
            text-align: center
            svg
                width: 100%
                height: auto

        > div
            margin: 48px 0

        h2, p
            margin: 0

        h2
            display: flex
            align-items: center
            justify-content: center
            color: var(--secondary-lighter)

            svg
                margin-right: 12px
                fill: currentColor

        @media (min-width: 700px)
            width: 100%
            background-image: url(@/.assets/root/decor_overview.svg)
            background-size: 50%
            background-repeat: no-repeat
            background-position: center

            .decor
                display: none

            > div
                display: flex
                align-items: center
                justify-content: space-between
                height: 80px

            .simple, .sending
                padding: 0 48px

            p
                font-weight: bold


.section_example
    background-color: var(--primary-darker)
    color: white

    .invite
        margin-bottom: 48px
        font-size: 14px


.section_quotes

    .block
        display: flex
        flex-wrap: wrap
        @media (max-width: 800px)
            flex-direction: column

        > div
            flex-basis: 0
            flex-grow: 1

            @media (min-width: 800px)
                &:first-child
                    padding-right: 20px

                &:last-child
                    padding-left: 20px

    blockquote
        font-size: 24px
        font-style: italic
        text-align: center
        opacity: 0.7
        margin: 0
        margin-bottom: 40px
        border-style: none
        color: inherit

        @media (min-width: 800px)
            padding-left: 70px
            padding-top: 10px

            &:before
                content: ""
                position: absolute
                z-index: -1
                width: 60px
                height: 60px
                background-repeat: no-repeat
                background-position: center
                background-size: 60px
                background-image: url(@/.assets/root/format_quote_start.svg)
                margin-left: -70px
                margin-top: -10px


.section_more
    background-color: var(--primary-darker)
    color: var(--mdc-theme-on-primary)
    text-align: center
    height: 500px


</style>
