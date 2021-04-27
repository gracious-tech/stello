
<template lang='pug'>

div.respondbar(:class='{respondable: respondable_final}')
    shared-respond-reply(v-if='can_reply' @click='toggle_respondable')
    shared-respond-react(v-if='can_react' @click='toggle_respondable')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Profile} from '@/services/database/profiles'
import {Section} from '@/services/database/sections'
import SharedRespondReply from '@/shared/SharedRespondReply.vue'
import SharedRespondReact from '@/shared/SharedRespondReact.vue'


@Component({
    components: {SharedRespondReact, SharedRespondReply},
})
export default class extends Vue {

    @Prop() profile:Profile
    @Prop() section:Section

    get respondable_final():boolean{
        // Quick access to respondable_final
        return this.section.respondable_final
    }

    get can_reply():boolean{
        // Whether can reply (on an account level)
        return this.profile?.options.allow_replies !== false
    }

    get can_react():boolean{
        // Whether can react (on an account level)
        return this.profile?.options.allow_reactions !== false
    }

    toggle_respondable():void{
        // Toggle, resolving null to opposite of whatever is current final (can't go back to null)
        this.section.respondable = !this.respondable_final
        self._db.sections.set(this.section)
    }

}

</script>


<style lang='sass' scoped>

.respondbar
    display: flex
    justify-content: space-around
    align-items: center

    &:not(.respondable)
        opacity: 0.5

    .toggle
        opacity: 0.5  // To match normal opacity of buttons

</style>
