
<template lang='pug'>

div
    v-toolbar
        v-toolbar-title Responses
        v-spacer
        app-btn(@click='download' icon='cloud_download')

    app-content(class='pa-5')
        route-replies-subsection(v-for='replactions of subsections' :replactions='replactions'
            :key='replactions[0].subsection_id || replactions[0].section_id || replactions[0].id')

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import RouteRepliesSubsection from './assets/RouteRepliesSubsection.vue'
import {sort} from '@/services/utils/arrays'
import {Reply} from '@/services/database/replies'
import {Reaction} from '@/services/database/reactions'


@Component({
    components: {RouteRepliesSubsection},
})
export default class extends Vue {

    subsections:(Reply|Reaction)[][] = []

    created(){
        this.load()
    }

    async load(){

        // Get items from db
        const [replies, reactions] =
            await Promise.all([self._db.replies.list(), self._db.reactions.list()])

        // Merge into one array and sort by date
        const responses = [...replies, ...reactions]
        sort(responses, 'sent', false)

        // Reset array of subsections where the item is an array of responses to that subsection
        // NOTE Some items will be sectionless, containing a single response to a whole message
        this.subsections = []

        // Keep a mapping of section/subsection id to the array of responses (so can look up)
        // NOTE Sectionless responses will not be included in this
        const subsections_map:Record<string, (Reply|Reaction)[]> = {}

        // Group responses by section/subsection
        for (const response of responses){

            // Either use the subsection id, or section id, if either available
            // NOTE Both are random uuids, so shouldn't be any conflicts
            const subsection_id = response.subsection_id ?? response.section_id
            if (subsection_id){
                // See if there is already an array for the subsection
                if (! (subsection_id in subsections_map)){
                    // This is the first response to the subsection, so create new array
                    // NOTE Important that item in map points to same item in `subsections`
                    subsections_map[subsection_id] = []
                    this.subsections.push(subsections_map[subsection_id])
                }
                // Add response to the subsection's array
                subsections_map[subsection_id].push(response)
            } else {
                // This response is sectionless (a general response to whole message)
                this.subsections.push([response])
            }
        }
    }

    async download(){
        // Manually trigger a download of responses
        this.$tm.start_responses_receive()
    }
}

</script>


<style lang='sass' scoped>

</style>
