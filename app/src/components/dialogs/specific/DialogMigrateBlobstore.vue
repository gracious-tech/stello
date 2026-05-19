
<template lang='pug'>

v-card(class='pa-6')

    template(v-if='phase === "ready"')
        v-card-title(class='justify-center') Upgrade database
        v-card-text
            v-alert(v-if='error_id' text color='error' class='mb-4')
                | Upgrade failed. This can happen if Stello can't access the files it needs.
                | You can retry or #[app-a(:href='support_url') contact us] for help.
            p Stello has updated how images and files are stored. Running this optimization will
                |  save space on your hard drive and ensure your files can be backed up properly.
            p(class='mt-3 font-weight-bold')
                | Do not close the app once started. It may take several minutes to complete.
        v-card-actions
            app-btn(@click='$emit("close")') Cancel
            app-btn(@click='start' color='accent') Start

    template(v-else-if='phase === "running"')
        v-card-title(class='justify-center') Upgrading database...
        v-card-text(class='text-center')
            v-progress-circular(:value='percent' :rotate='-90' :size='60' :width='6'
                color='accent' class='my-4')
            div {{ progress }} of {{ total }}

    template(v-else)
        v-card-title(class='justify-center') Upgrade complete
        v-card-text(class='text-center')
            p Your files have been optimized successfully.
        v-card-actions(class='justify-end')
            app-btn(@click='$emit("close", true)' color='accent') Done

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import {migrate} from '@/services/database/blobstore_migrate'
import {error_to_string} from '@/services/utils/exceptions'


@Component({})
export default class extends Vue {

    phase:'ready'|'running'|'complete' = 'ready'
    progress = 0
    total = 0
    error_id = ''

    get percent(){
        return this.total ? (this.progress / this.total * 100) : 0
    }

    get support_url(){
        const desc = `Stello blobstore_migrate failed.\nError id: ${this.error_id}`
        return `https://gracious.tech/contact?desc=${encodeURIComponent(desc)}`
    }

    async start(){
        this.error_id = ''
        this.phase = 'running'
        try {
            await migrate((progress, total) => {
                this.progress = progress
                this.total = total
            })
            this.$store.commit('dict_set', ['show_blobstore_migrate', false])
            this.phase = 'complete'
        } catch (error){
            const error_str = error_to_string(error)
            this.error_id =
                self.app_report_error(`blobstore_migrate failed\n${error_str}`) || 'unknown'
            this.phase = 'ready'
        }
    }
}

</script>


<style lang='sass' scoped>

</style>
