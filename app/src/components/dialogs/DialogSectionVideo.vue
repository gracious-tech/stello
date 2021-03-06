
<template lang='pug'>

v-card

    v-card-title Video Settings

    v-card-text
        p(class='mt-4')
            app-text(@input='process_url' :rules='[validate_url]'
                placeholder="Youtube/Vimeo URL...")

        shared-video(:format='content.format' :id='content.id'
            :start='content.start' :end='content.end')

        p.range(class='mt-4')
            app-text(:value='static_start' @input='start_changed' :rules='[validate_time]'
                :disabled='!content.format' label="Start" placeholder="hh:mm:ss")
            app-text(:value='static_end' @input='end_changed' :rules='[validate_time]'
                :disabled='!content.format || !can_end_early' label="End" placeholder="hh:mm:ss")

    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Section} from '@/services/database/sections'
import {ContentVideo} from '@/services/database/types'
import SharedVideo from '@/shared/SharedVideo.vue'
import {debounce_method} from '@/services/misc'


function secs_to_hms(secs:number):string{
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


function hms_to_secs(hms:string):number{
    // Convert an hours:minutes:seconds string to number of total seconds

    // Separate parts
    const parts = hms.split(':')
    if (parts.length === 0 || parts.length > 3){
        return null
    }

    // Convert to numbers
    const secs = parseInt(parts.pop(), 10)
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

    @Prop() section:Section<ContentVideo>

    static_start:string = null
    static_end:string = null

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

    parse_url(input:string):{format:'iframe_youtube'|'iframe_vimeo', id:string}{
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
                id: url.searchParams.get('v'),
            }
        } else if (url.hostname.endsWith('youtu.be')){
            return {
                format: 'iframe_youtube',
                id: url.pathname.split('/')[1],
            }
        } else if (url.hostname.endsWith('vimeo.com')){
            return {
                format: 'iframe_vimeo',
                id: url.pathname.split('/')[1],
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
            self._db.sections.set(this.section)
            // Must also reset the start/end fields since they don't react to programatic changes
            this.static_start = null
            this.static_end = null
        }
    }

    validate_time(hms:string):string|boolean{
        // If a value has been entered and it can't be parsed, return error msg
        return hms && hms.trim() && hms_to_secs(hms) === null ? "Must be hh:mm:ss" : true
    }

    @debounce_method(1000)
    start_changed(hms:string){
        // Update the start property
        this.content.start = hms_to_secs(hms)
        this.change_range()
    }

    @debounce_method(1000)
    end_changed(hms:string){
        // Update the end property
        this.content.end = hms_to_secs(hms)
        this.change_range()
    }

    change_range(){
        // Save changes to a time range
        self._db.sections.set(this.section)
        // If vimeo, force removal of iframe from dom to update time range since its stored in hash
        if (this.content.format === 'iframe_vimeo'){
            this.content.format = null
            this.$nextTick(() => {
                this.content.format = 'iframe_vimeo'
            })
        }
    }

    dismiss(){
        this.$store.dispatch('show_dialog', null)
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
