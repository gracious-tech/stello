
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Responses
        v-spacer
        app-btn.download(@click='download' icon='cloud_download' data-tip="Check for new responses")

    div.filters(class='app-bg-primary-relative')
        div.inner(class='d-flex justify-space-around align-center pa-3')
            app-switch(v-model='filter_current' label="Hide archived" dark class='mb-0 mr-2')
            app-select(v-model='filter_contact' :items='contacts_ui' label="Contact" outlined dense
                clearable append-icon='' dark)
            app-select(v-model='filter_message' :items='messages_ui' label="Message" outlined dense
                clearable append-icon='' dark)

    app-content(class='pa-5')

        transition-group(name='trans-right')
            route-replies-subsection(v-for='replactions of subsections_visible'
                :replactions='replactions.items' :key='replactions.key' :names='contact_names'
                @removed='on_removed')

        div(v-if='!subsections_visible.length' class='text-center text--secondary text-h5 my-10')
            | No responses

        div(v-if='subsections_visible.length < subsections.length' class='text-center')
            app-btn(@click='pages *= 2' small) Show More

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import RouteRepliesSubsection from './assets/RouteRepliesSubsection.vue'
import {remove_match, sort} from '@/services/utils/arrays'
import {Reply} from '@/services/database/replies'
import {Reaction} from '@/services/database/reactions'
import {Task} from '@/services/tasks/tasks'


type MinOne<T> = [T, ...T[]]


@Component({
    components: {RouteRepliesSubsection},
})
export default class extends Vue {

    replactions:(Reply|Reaction)[] = []
    contact_names:Record<string, string> = {}  // Cache of up-to-date contact names
    pages = 1
    filter_current = true  // Only show current (non-archived)
    filter_contact:string|null = null
    filter_message:string|null = null
    filter_search:string|null = null  // TODO Not yet implemented

    created(){
        void this.load()
    }

    get replactions_matched(){
        // Get replactions filtered by all the active filters
        const lower_search = this.filter_search?.toLowerCase()
        return this.replactions.filter(replaction => {
            if (this.filter_current && replaction.archived)
                return false
            if (this.filter_contact && replaction.contact_id !== this.filter_contact)
                return false
            if (this.filter_message && replaction.msg_id !== this.filter_message)
                return false
            if (lower_search && (replaction.is_reaction ||
                    !replaction.content.toLowerCase().includes(lower_search)))
                return false
            return true
        })
    }

    get subsections(){
        // Get array of subsections where the item is an array of responses to that subsection
        // NOTE Some items will be sectionless, containing a single response to a whole message
        const subsections:(Reply|Reaction)[][] = []

        // Keep a mapping of section/subsection id to the array of responses (so can look up)
        // NOTE Sectionless responses will not be included in this
        const subsections_map:Record<string, (Reply|Reaction)[]> = {}

        // Group responses by section/subsection
        for (const response of this.replactions_matched){

            // Either use the subsection id, or section id, if either available
            // NOTE Both are random uuids, so shouldn't be any conflicts
            const subsection_id = response.subsection_id ?? response.section_id
            if (subsection_id){
                // See if there is already an array for the subsection
                if (! (subsection_id in subsections_map)){
                    // This is the first response to the subsection, so create new array
                    // NOTE Important that item in map points to same item in `subsections`
                    subsections_map[subsection_id] = []
                    subsections.push(subsections_map[subsection_id]!)
                }
                // Add response to the subsection's array
                subsections_map[subsection_id]!.push(response)
            } else {
                // This response is sectionless (a general response to whole message)
                subsections.push([response])
            }
        }

        return subsections as MinOne<Reply|Reaction>[]
    }

    get subsections_visible(){
        // The subsections present in the DOM, optionally limited to reduce lag
        const replactions_allowance = 50 * this.pages
        let replactions_count = 0
        const visible = []
        for (const replactions of this.subsections){
            visible.push({
                items: replactions,
                key: replactions[0].subsection_id || replactions[0].section_id || replactions[0].id,
            })
            replactions_count += replactions.length
            if (replactions_count >= replactions_allowance)
                break
        }
        return visible
    }

    get contacts_ui(){
        // Get contacts that have responded in UI form for use in select component
        const ui_array = Object.entries(this.contact_names).map(([k, v]) => ({value: k, text: v}))
        sort(ui_array, 'text')
        return ui_array
    }

    get messages_ui(){
        // Get messages that have been responded to in UI form for use in select component
        const messages:Record<string, string> = {}
        for (const replaction of this.replactions){
            messages[replaction.msg_id] = replaction.msg_title
        }
        const ui_array = Object.entries(messages).map(([k, v]) => ({value: k, text: v}))
        // NOTE Not sorting as, since replactions sorted by date, should end up close to msg date
        return ui_array
    }

    @Watch('$tm.data.finished') watch_tm_finished(task:Task){
        // Listen to task completions and adjust state as needed
        if (task.name === 'responses_receive'){
            void this.load()
        }
    }

    async load(){
        // Get items from db
        const [replies, reactions] =
            await Promise.all([self.app_db.replies.list(), self.app_db.reactions.list()])

        // Merge into one array and sort by date
        this.replactions = [...replies, ...reactions]
        sort(this.replactions, 'sent', false)

        // Also load contacts in case names have been updated
        // NOTE Important when user hasn't previously bothered to enter names, just addresses
        for (const replaction of this.replactions){
            // Don't reload contact if already have name, as won't have changed
            if (! (replaction.contact_id in this.contact_names)){
                // Init with replaction name so don't wait for db and in case contact deleted
                this.$set(this.contact_names, replaction.contact_id,
                    replaction.contact_name || "[nameless]")
                void self.app_db.contacts.get(replaction.contact_id).then(contact => {
                    if (contact){
                        this.$set(this.contact_names, replaction.contact_id, contact.display)
                    }
                })
            }
        }
    }

    download(){
        // Manually trigger a download of responses
        void this.$tm.start_responses_receive()
    }

    on_removed(replaction_id:string):void{
        // Handle the removal of a replaction
        remove_match(this.replactions, item => item.id === replaction_id)
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.download::after
    // Position tooltip to left so doesn't go off page
    top: auto !important
    right: 60px

.filters

    .inner
        max-width: $header-width
        margin-left: auto
        margin-right: auto

    .v-input
        margin: 0 12px  // Space items out

    .v-select
        flex-basis: 0  // Stop fields changing size based on their contents

    ::v-deep
        .v-input__slot
            margin-bottom: 0  // Rm to correct vertical alignment

        .v-text-field__details, .v-messages
            display: none  // Rm to correct vertical alignment


</style>
