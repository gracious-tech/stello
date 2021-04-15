
<template lang='pug'>

div.respondbar
    shared-respond-reply(v-if='can_reply' :class='{invisible: !respondable_final}' disabled)
    v-tooltip(v-if='can_reply || can_react' top)
        | Toggle ability to respond to a section
        template(#activator='tooltip')
            app-btn-checkbox.toggle(v-bind='tooltip.attrs' v-on='tooltip.on'
                :value='section.respondable' @click='toggle_respondable' color='')
    shared-respond-react(v-if='can_react' :class='{invisible: !respondable_final}' disabled)

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
    opacity: 0.5  // Don't distract from editing message (not addition to buttons' transparency)

    .toggle
        opacity: 0.5  // To match normal opacity of buttons

</style>
