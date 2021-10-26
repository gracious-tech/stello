
<template lang='pug'>

v-card

    v-card-title Video Settings

    v-card-text
        div(class='mt-4')
            app-text(@input='process_url' :rules='[validate_url]' label="Video URL"
                placeholder="Youtube/Vimeo URL...")

        shared-video(:format='content.format' :id='content.id'
            :start='content.start' :end='content.end')

        div(class='text-center mt-1')
            p(v-if='show_help')
                | If you have the correct URL but the video will not play,
                | the video may be banned from playing outside of the video service's website
                | because (1) the author forbids it, or (2)
                | a song or segment of the video is copyrighted (even if you own the video).
            app-btn(v-else @click='show_help = true' small) Not playing?

        app-textarea(v-model='caption' label="Caption" :rows='1' dense class='mt-8')

        div.range
            app-text(:value='static_start' @input='start_changed' :rules='[validate_time]'
                :disabled='!content.format' label="Start" placeholder="hh:mm:ss")
            app-text(:value='can_end_early ? static_end : ""' @input='end_changed'
                :rules='[validate_time]'
                :disabled='!content.format || !can_end_early' label="End" placeholder="hh:mm:ss")

    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedVideo from '@/shared/SharedVideo.vue'
import {Section} from '@/services/database/sections'
import {ContentVideo} from '@/services/database/types'
import {debounce_method} from '@/services/misc'


function secs_to_hms(secs:number|null):string{
    // Convert seconds as a number to a string of hours:minutes:seconds
    if (secs === null){
        return ''
    }

    // Separate values into hours/mins/secs
    let mins = Math.floor(secs / 60)
    const hours = Math.floor(mins / 60)
    mins = mins % 60
    secs = secs % 60

    // Helper for zero padding a number
    const pad = (n:number):string => n < 10 ? `0${n}` : `${n}`

    // Leave out hours if possible
    if (hours){
        return `${hours}:${pad(mins)}:${pad(secs)}`
    }
    return `${mins}:${pad(secs)}`
}


function hms_to_secs(hms:string):number|null{
    // Convert an hours:minutes:seconds string to number of total seconds

    // Separate parts
    const parts = hms.split(':')
    if (parts.length === 0 || parts.length > 3){
        return null
    }

    // Convert to numbers
    const secs = parseInt(parts.pop()!, 10)
    const mins = parseInt(parts.pop() ?? '0', 10)
    const hours = parseInt(parts.pop() ?? '0', 10)
    if ([secs, mins, hours].includes(NaN)){
        return null
    }

    // Return sum
    return secs + mins * 60 + hours * 60 * 60
}


@Component({
    components: {SharedVideo},
})
export default class extends Vue {

    @Prop({required: true}) section!:Section<ContentVideo>

    show_help = false
    static_start:string|null = null
    static_end:string|null = null

    created(){
        // Set initial range values (not updated unless video source changed)
        this.static_start = secs_to_hms(this.section.content.start)
        this.static_end = secs_to_hms(this.section.content.end)
    }

    get content(){
        // Easier access to content
        return this.section.content
    }

    get can_end_early(){
        // Whether player can be configured to end the video earlier than its full duration
        return this.content.format === 'iframe_youtube'
    }

    get caption(){
        // Return caption for this video
        return this.content.caption
    }
    set caption(value){
        // Change the caption of this video
        this.content.caption = value
        void self.app_db.sections.set(this.section)
    }

    parse_url(input:string):{format:'iframe_youtube'|'iframe_vimeo', id:string}|null{
        // Parse url and return format and id if valid
        let url:URL
        try {
            url = new URL(input.trim())
        } catch {
            return null
        }
        if (url.hostname.endsWith('youtube.com')){
            return {
                format: 'iframe_youtube',
                id: url.searchParams.get('v') ?? '',
            }
        } else if (url.hostname.endsWith('youtu.be')){
            return {
                format: 'iframe_youtube',
                id: url.pathname.split('/')[1] ?? '',
            }
        } else if (url.hostname.endsWith('vimeo.com')){
            return {
                format: 'iframe_vimeo',
                id: url.pathname.split('/')[1] ?? '',
            }
        }
        return null
    }

    validate_url(input:string):string|boolean{
        // Return error string if invalid, else true
        return this.parse_url(input) ? true : "Must be a Youtube or Vimeo URL"
    }

    @debounce_method(1000)
    process_url(input:string):void{
        // Handle changes to the url field
        const video_props = this.parse_url(input)
        if (video_props){
            // It's a valid url, so update the db record
            this.content.format = video_props.format
            this.content.id = video_props.id
            this.content.start = null
            this.content.end = null
            this.save()
            // Must also reset the start/end fields since they don't react to programatic changes
            this.static_start = null
            this.static_end = null
        }
    }

    validate_time(hms:string):string|boolean{
        // If a value has been entered and it can't be parsed, return error msg
        return hms && hms.trim() && hms_to_secs(hms) === null ? "Must be hh:mm:ss" : true
    }

    start_changed(hms:string){
        // Update the start property
        this.content.start = hms_to_secs(hms)
        this.save()
        this.force_iframe_reload()
    }

    end_changed(hms:string){
        // Update the end property
        this.content.end = hms_to_secs(hms)
        this.save()
        this.force_iframe_reload()
    }

    @debounce_method(1000)
    force_iframe_reload(){
        // If vimeo, force removal of iframe from dom to update time range since its stored in hash
        if (this.content.format === 'iframe_vimeo'){
            this.content.format = null
            this.$nextTick(() => {
                this.content.format = 'iframe_vimeo'
            })
        }
    }

    save(){
        // Save changes to db
        void self.app_db.sections.set(this.section)
    }

    dismiss(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

::v-deep svg
    cursor: auto  // No action if click on placeholder svg within dialog

.range
    display: flex

    .v-input:first-child
        margin-right: 24px

</style>
