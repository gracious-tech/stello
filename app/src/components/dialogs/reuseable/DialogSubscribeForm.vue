
<template lang='pug'>

v-card
    v-card-title Subscription Form

    v-card-text
        div(class='mt-4') Message above form:
        app-html.html(v-model='text' class='stello-displayer-styles')
        app-select(v-model='service_account' :disabled='service_account_items.length <= 1'
            :items='service_account_items' select label="Save contacts in")
        app-select(v-model='chosen_groups' :items='groups_items' multiple
            label="Add contacts to groups")
        app-switch(v-model='accept_message' label="Show optional comment field"
            hint="Use this if you ask people for any extra info when they subscribe")

    v-card-actions
        app-btn(@click='done') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Profile} from '@/services/database/profiles'
import {Group} from '@/services/database/groups'
import {OAuth} from '@/services/database/oauths'
import {SubscribeForm} from '@/services/database/subscribe_forms'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly profile:Profile
    @Prop({required: true}) declare readonly form:SubscribeForm
    @Prop({required: true}) declare readonly groups:Group[]
    @Prop({required: true}) declare readonly oauths:OAuth[]

    get text(){
        return this.form.text
    }
    set text(value:string){
        this.form.text = value
        this.save(true)
    }

    get accept_message(){
        return this.form.accept_message
    }
    set accept_message(value){
        this.form.accept_message = value
        this.save(true)
    }

    get service_account(){
        return this.form.service_account
    }
    set service_account(id){
        this.form.service_account = id
        this.save()
    }

    get service_account_items(){
        return [
            {text: "Stello", value: null},
            ...this.oauths.filter(oauth => oauth.contacts_sync)
                .map(oauth => ({text: oauth.display, value: oauth.service_account})),
        ]
    }

    get chosen_groups(){
        // Array of chosen group ids
        return this.groups.filter(g => this.form.groups.includes(g.id)).map(g => g.id)
    }
    set chosen_groups(group_ids){
        // Change the chosen groups
        this.form.groups = group_ids
        this.save()
    }

    get groups_items(){
        // Return possible groups in format that v-select understands
        return this.groups.filter(group => {
            // Can select if a Stello group or if same account
            return !group.service_account || this.service_account === group.service_account
        }).map(group => {
            return {
                value: group.id,
                text: group.display,
            }
        })
    }

    save(affects_config=false){
        void self.app_db.subscribe_forms.set(this.form)
        if (affects_config){
            // Changes to text etc only affect subscribe config, responder config has only ids
            this.profile.host_state.subscribe_config_uploaded = false
            void self.app_db.profiles.set(this.profile)
        }
    }

    done(){
        this.$emit('close')
    }
}

</script>


<style lang='sass' scoped>

.html
    border: 1px solid #8888
    padding: 12px
    margin-top: 4px
    margin-bottom: 24px

</style>
