
<template lang='pug'>

v-card
    v-card-title Message appearance

    v-card-text
        p This will change the appearance of all messages, including those already sent.
        profile-theme(:profile='profile' @save='save')

    v-card-actions
        app-btn(@click='done') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import ProfileTheme from '@/components/reuseable/ProfileTheme.vue'
import {Profile} from '@/services/database/profiles'
import {task_manager} from '@/services/tasks/tasks'


@Component({
    components: {ProfileTheme},
})
export default class extends Vue {

    @Prop({required: true}) declare readonly profile:Profile

    save(){
        // Save changes to profile
        this.profile.host_state.displayer_config_uploaded = false
        void self.app_db.profiles.set(this.profile)
    }

    done(){
        this.$emit('close')
        // Update diplayer config if needed
        if (this.profile.configs_need_uploading){
            void task_manager.start_configs_update(this.profile.id)
        }
    }
}

</script>


<style lang='sass' scoped>

</style>
