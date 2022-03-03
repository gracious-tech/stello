
<template lang='pug'>

v-list-item(:to='route')
    v-list-item-content
        v-list-item-title
            | {{ profile.display }}
            v-chip(v-if='is_incomplete' small class='ml-3 app-bg-primary-relative') incomplete
            v-chip(v-else-if='is_default' small class='ml-3 app-bg-primary-relative') default
    v-list-item-action
        app-menu-more
            app-list-item(@click='make_default' :disabled='is_default || is_incomplete')
                | Make default
            app-list-item(@click='remove' class='error--text') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogGenericConfirm from '@/components/dialogs/generic/DialogGenericConfirm.vue'
import {Profile} from '@/services/database/profiles'
import {Task} from '@/services/tasks/tasks'
import {MustReconnect} from '@/services/utils/exceptions'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly profile:Profile

    get route(){
        return {name: 'profile', params: {profile_id: this.profile.id}}
    }

    get is_default(){
        return this.profile.id === this.$store.state.default_profile
    }

    get is_incomplete(){
        return !this.profile.setup_complete
    }

    make_default(){
        this.$store.commit('dict_set', ['default_profile', this.profile.id])
    }

    async remove(){

        // Confirm before deleting
        if (this.profile.setup_complete){
            const confirmed = await this.$store.dispatch('show_dialog', {
                component: DialogGenericConfirm,
                props: {
                    title: `Really delete account "${this.profile.display}"?`,
                    text: "Recipients will lose access to all sent messages",
                    confirm: "Delete",
                    confirm_danger: true,
                },
            }) as boolean
            if (!confirmed){
                return
            }
        }

        // Remove services
        if (this.profile.host_accessible){
            void this.$store.dispatch('show_waiting', "Deleting account...")
            try {
                const host_user = await self.app_db.new_host_user(this.profile)
                await host_user.delete_services(new Task('', [], []))
            } catch (error){

                // Close waiting dialog so can show another
                await this.$store.dispatch('close_dialog')

                // Fail if no network connection
                if (error instanceof MustReconnect){
                    void this.$store.dispatch('show_snackbar', "Could not connect")
                    return
                }

                // Report as shouldn't happen
                self.app_report_error(error)

                // Confirm if want to delete profile locally even if account remains
                const confirmed = await this.$store.dispatch('show_dialog', {
                    component: DialogGenericConfirm,
                    props: {
                        title: `Unable to confirm account deleted`,
                        text: `Something went wrong in deleting the account.
                            This may be because it was already deleted, or there may
                            still be messages remaining.`,
                        confirm: "Assume deleted",
                        confirm_danger: true,
                    },
                }) as boolean
                if (!confirmed){
                    return
                }

            } finally {
                // Ensure waiting dialog always closed
                void this.$store.dispatch('close_dialog')
            }
        }

        // Remove from db
        void self.app_db.profiles.remove(this.profile.id)

        // Clear the default if this was it, so another can take it
        if (this.is_default){
            this.$store.commit('dict_set', ['default_profile', null])
        }

        // Notify parent that this profile has been removed
        this.$emit('removed', this.profile.id)
    }

}

</script>


<style lang='sass' scoped>


.v-chip
    pointer-events: none


</style>
