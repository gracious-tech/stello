
<template lang='pug'>

v-card(v-if='requests.length')
    v-card-title Requests to subscribe
    v-list
        template(v-for='[profile_id, profile_display, profiles_requests] of grouped_requests')
            v-subheader(:key='profile_id' class='justify-center font-weight-bold')
                | {{ profile_display }}
            RequestsSubscribeItem(v-for='request of profiles_requests' :key='request.id'
                :request='request' @removed='removed')

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import RequestsSubscribeItem from './assets/RequestsSubscribeItem.vue'
import {Task} from '@/services/tasks/tasks'
import {RecordRequestSubscribe} from '@/services/database/types'
import {remove_item} from '@/services/utils/arrays'
import {Profile} from '@/services/database/profiles'


@Component({
    components: {RequestsSubscribeItem},
})
export default class extends Vue {

    profiles:Profile[] = []
    requests:RecordRequestSubscribe[] = []

    created(){
        void this.load()
    }

    get grouped_requests(){
        // Get requests grouped by profile
        const items:[string, string, RecordRequestSubscribe[]][] = []
        for (const profile of this.profiles){
            const profiles_requests = this.requests.filter(r => r.profile === profile.id)
            if (profiles_requests.length){
                items.push([profile.id, profile.display, profiles_requests])
            }
        }
        return items
    }

    async load(){
        // Load requests
        this.profiles = await self.app_db.profiles.list()
        this.requests = await self.app_db._conn.getAll('request_subscribe')
    }

    removed(request:RecordRequestSubscribe){
        remove_item(this.requests, request)
    }

    @Watch('$tm.data.succeeded') watch_finished(task:Task){
        // Respond to task completions
        if (task.name === 'responses_receive'){
            // May have received a new request
            void this.load()
        }
    }

}

</script>


<style lang='sass' scoped>

</style>
