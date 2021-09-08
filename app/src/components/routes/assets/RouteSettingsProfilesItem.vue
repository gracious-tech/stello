
<template lang='pug'>

v-list-item(:to='route')
    v-list-item-content
        v-list-item-title
            | {{ profile.display }}
            v-chip(v-if='is_default' small class='ml-3 app-bg-primary-relative') default
            v-chip(v-if='is_incomplete' small class='ml-3 app-bg-primary-relative') incomplete
    v-list-item-action
        app-menu-more
            app-list-item(@click='make_default' :disabled='is_default || is_incomplete') Make default
            app-list-item(@click='remove' color='error') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Profile} from '@/services/database/profiles'


@Component({})
export default class extends Vue {

    @Prop() profile:Profile

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

    remove(){
        // Remove from db
        self.app_db.profiles.remove(this.profile.id)
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
