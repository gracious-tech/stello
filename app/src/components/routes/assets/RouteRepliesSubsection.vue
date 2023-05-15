
<template lang='pug'>

v-card(class='my-8')

    div.header(class='d-flex align-center justify-space-between'
            :class='{"app-bg-primary-relative": sectionless}')
        span(@click='go_to_msg' class='text-subtitle-2 ml-4') {{ msg_title }}
        app-menu-more
            app-list-item(@click='archive_all' :disabled='all_archived') Archive all
            app-list-item(@click='remove_all' class='error--text') Delete all

    div.section_content(v-if='!sectionless' class='stello-displayer-styles'
            :class='{img: section_image, expanded: section_expanded}')
        shared-chart(v-if='section_chart_props' v-bind='section_chart_props')
        img(v-else-if='section_image' :src='section_image')
        div(v-else v-html='section_html' class='ma-4 text--secondary')

    //- NOTE Not showing expand button if no section data, as will only show very short note
    div.expand(v-if='!sectionless && section' class='d-flex justify-end')
        app-btn(@click='section_expanded = !section_expanded' :icon='expand_icon' fab small
            color='')

    v-card-text
        transition-group(name='trans-right')
            RouteRepliesReplaction(v-for='replaction of replactions' :key='replaction.id'
                :replaction='replaction' :name='names[replaction.contact_id]' @removed='on_removed')


</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedChart from '@/shared/SharedChart.vue'
import RouteRepliesReplaction from '@/components/routes/assets/RouteRepliesReplaction.vue'
import {Reply} from '@/services/database/replies'
import {Reaction} from '@/services/database/reactions'
import {Section} from '@/services/database/sections'
import {request_json} from '@/services/utils/http'
import {escape_for_html} from '@/services/utils/strings'


@Component({
    components: {RouteRepliesReplaction, SharedChart},
})
export default class extends Vue {

    @Prop({type: Array, required: true}) declare readonly replactions:(Reply|Reaction)[]
    @Prop({type: Object, required: true}) declare readonly names:Record<string, string>

    section:Section|null = null
    section_image_vimeo:string|null = null
    section_image_blob = ''
    section_expanded = false

    destroyed(){
        URL.revokeObjectURL(this.section_image_blob)
    }

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

    get section_chart_props():Record<string, unknown>|undefined{
        // Props for chart component if section is a chart
        if (this.section?.content.type !== 'chart'){
            return undefined
        }
        return {
            id: 'subsection' + this.section.id,  // Prefixed in case later show multiple times
            type: this.section.content.chart,
            data: this.section.content.data,
            threshold: this.section.content.threshold,
            title: this.section.content.title,
            caption: this.section.content.caption,
            dark: this.$store.state.dark,
        }
    }

    get section_image():string|null{
        // Return url for an image that represents the section (if any)
        // TODO Show heros using shared-hero component so text also included?
        if (this.section?.content.type === 'images'){
            const images = this.section.content.images
            const image = images.find(i => i.id === this.first.subsection_id)
            if (image){
                URL.revokeObjectURL(this.section_image_blob)
                this.section_image_blob = URL.createObjectURL(image.data)
                return this.section_image_blob
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

    get section_html(){
        // Text content for the section (as HTML)
        if (this.section?.content.type === 'text'){
            return this.section.content.html
        } else if (this.section?.content.type === 'files'){
            return `<div class='btn-text'>
                ${escape_for_html(this.section.content.label || "Download")}
            </div>`
        }
        return `<small><em>
            Responses to an unknown section (original message may have been deleted)
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

    remove_all(){
        // Remove all replactions of the section
        for (const replaction of this.replactions){
            void self.app_db[replaction.is_reply ? 'replies' : 'reactions'].remove(replaction.id)
            this.on_removed(replaction.id)
        }
    }

    on_removed(replaction_id:string){
        // Pass removed event up to parent
        this.$emit('removed', replaction_id)
    }

}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


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
        max-height: 160px
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
