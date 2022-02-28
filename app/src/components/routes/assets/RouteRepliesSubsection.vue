
<template lang='pug'>

v-card(class='my-8')

    div.header(class='d-flex align-center justify-space-between'
            :class='{"app-bg-primary-relative": sectionless}')
        span(@click='go_to_msg' class='text-subtitle-2 ml-4') {{ msg_title }}
        app-btn(v-if='!all_archived' @click='archive_all' icon='archive' class='mr-2'
            data-tip="Archive all")

    div.section_content(v-if='!sectionless'
            :class='{img: section_image, expanded: section_expanded}')
        img(v-if='section_image' :src='section_image')
        div(v-else v-html='section_text' class='ma-4 text--secondary')

    //- NOTE Not showing expand button if no section data, as will only show very short note
    div.expand(v-if='!sectionless && section' class='d-flex justify-end')
        app-btn(@click='section_expanded = !section_expanded' :icon='expand_icon' fab small
            color='')

    v-card-text
        RouteRepliesReplaction(v-for='replaction of replactions' :key='replaction.id'
            :replaction='replaction' @removed='on_removed')


</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import RouteRepliesReplaction from '@/components/routes/assets/RouteRepliesReplaction.vue'
import {Reply} from '@/services/database/replies'
import {Reaction} from '@/services/database/reactions'
import {Section} from '@/services/database/sections'
import {request_json} from '@/services/utils/http'


@Component({
    components: {RouteRepliesReplaction},
})
export default class extends Vue {

    @Prop() declare readonly replactions:(Reply|Reaction)[]

    section:Section|null = null
    section_image_vimeo:string|null = null
    section_expanded = false

    async created(){
        // Get the section (if not sectionless)
        if (this.first.section_id){
            this.section = await self.app_db.sections.get(this.first.section_id) ?? null

            // Confirm if section data still available
            if (!this.section){
                this.section_expanded = true  // Actually reduces height since only short note shown
                return
            }

            // If a vimeo section then need to do an API request to get the placeholder image
            if (this.section.content.type === 'video'
                    && this.section.content.format === 'iframe_vimeo'){
                const video_id = this.section.content.id!
                const url = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${video_id}`
                try {
                    const oembed_resp:{thumbnail_url:string} = await request_json(url)
                    this.section_image_vimeo = oembed_resp.thumbnail_url
                } catch {
                    // Can't do anything about Vimeo issues... video probably deleted
                }
            }
        }
    }

    get first(){
        // The first replaction which is used to get basic info about the subsection
        return this.replactions[0]!
    }

    get sectionless(){
        // Whether reply is to the whole message (sectionless) or to a section
        return !this.first.section_id
    }

    get msg_title(){
        // Title of the message being responded to
        return this.first.msg_title
    }

    get section_image():string|null{
        // Return url for an image that represents the section (if any)
        if (this.section?.content.type === 'images'){
            const images = this.section.content.images
            const image = images.find(i => i.id === this.first.subsection_id)
            if (image){
                return URL.createObjectURL(image.data)
            }
        } else if (this.section?.content.type === 'video'){
            const video_id = this.section.content.id!
            if (this.section.content.format === 'iframe_youtube'){
                return `https://img.youtube.com/vi/${video_id}/hqdefault.jpg`
            } else if (this.section.content.format === 'iframe_vimeo'){
                return this.section_image_vimeo
            }
        }
        return null
    }

    get section_text(){
        // Text content for the section (as HTML)
        if (this.section?.content.type === 'text'){
            return this.section.content.html
        }
        return `<small><em>
            Responses to an unknown section (original message has been deleted)
        </em></small>`
    }

    get expand_icon(){
        // Icon for section content expansion button
        return this.section_expanded ? 'unfold_less' : 'unfold_more'
    }

    get all_archived(){
        // Whether all replactions in section have been archived yet
        return this.replactions.every(replaction => replaction.archived)
    }

    go_to_msg(){
        // Navigate to the message of the replactions
        void this.$router.push({name: 'message', params: {msg_id: this.first.msg_id}})
    }

    archive_all(){
        // Archive all replactions of the section
        for (const replaction of this.replactions){
            if (!replaction.archived){
                replaction.archived = true
                void self.app_db[replaction.is_reply ? 'replies' : 'reactions'].set(replaction)
            }
        }
    }

    on_removed(replaction_id:string){
        // Pass removed event up to parent
        this.$emit('removed', replaction_id)
    }

}

</script>


<style lang='sass' scoped>

@import 'src/styles/globals.sass'


.header
    height: 48px  // Match archive button so same when it isn't present

    &:not(.app-bg-primary-relative)
        // Make header standout a little if representing section (rather than a lot with primary bg)
        @include themed(background-color, #0002, #fff2)

    span
        cursor: pointer  // Message title navigates to message


.section_content

    &.img
        // Center image when overflowed
        display: flex
        flex-direction: column  // Row messes up image sizing
        justify-content: center

        img
            // Prevent image aspect ratio from changing
            width: 100%
            flex-grow: 0
            flex-shrink: 0

    &:not(.img):not(.expanded)
        // Fade out text when not expanded
        -webkit-mask-image: linear-gradient(180deg, #000 60%, transparent)

    &:not(.expanded)
        // Clip content when not expanded
        height: 160px
        overflow-y: hidden


.expand
    // Float expand button over content at bottom-right
    .v-btn
        position: absolute
        margin-top: -40px + -12px
        margin-right: 12px
        opacity: 0.5

        &:hover
            opacity: 1


</style>
