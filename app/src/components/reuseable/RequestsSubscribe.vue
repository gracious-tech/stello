
<template lang='pug'>

v-card(v-if='requests.length')
    v-card-title Requests to subscribe
    v-list
        RequestsSubscribeItem(v-for='request of requests' :key='request.id' :request='request'
            @removed='removed')

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import RequestsSubscribeItem from './assets/RequestsSubscribeItem.vue'
import {Task} from '@/services/tasks/tasks'
import {RecordRequestSubscribe} from '@/services/database/types'
import {remove_item} from '@/services/utils/arrays'


@Component({
    components: {RequestsSubscribeItem},
})
export default class extends Vue {

    requests:RecordRequestSubscribe[] = []

    created(){
        void this.load()
    }

    async load(){
        // Load requests
        this.requests = await self.app_db._conn.getAll('request_subscribe')
    }

    removed(request:RecordRequestSubscribe){
        remove_item(this.requests, request)
    }

    @Watch('$tm.data.finished') watch_finished(task:Task){
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
