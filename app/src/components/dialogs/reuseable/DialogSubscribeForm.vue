
<template lang='pug'>

v-card
    v-card-title Subscription Form

    v-card-text
        div(class='mt-4') Message above form:
        app-html.html(v-model='text' class='stello-displayer-styles')
        app-select(v-model='service_account' :items='service_account_items' select
            label="Save contacts in")
        app-select(v-model='chosen_groups' :items='groups_items' multiple
            label="Add contacts to groups")

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
        this.save()
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
        return this.groups.map(group => {
            return {
                value: group.id,
                text: group.display,
            }
        })
    }

    save(){
        void self.app_db.subscribe_forms.set(this.form)
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
