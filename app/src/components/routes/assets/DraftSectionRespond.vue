
<template lang='pug'>

//- WARN respondable class is inspected by parent component
div.respondbar(v-if='can_respond' :class='{respondable: respondable_final}')
    template(v-if='respondable_final')
        shared-respond-reply(v-if='can_comment' @click='toggle_respondable')
        shared-respond-react(v-if='can_react' @click='toggle_respondable')
    app-btn.show(v-else @click='toggle_respondable' small color='') Enable responses

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

    @Prop({required: true}) declare readonly section:Section
    @Prop({default: undefined}) declare readonly profile:Profile|undefined

    get respondable_final():boolean{
        // Quick access to respondable_final
        return this.section.respondable_final
    }

    get can_comment():boolean{
        // Whether can comment (on an account level)
        return this.profile?.options.allow_comments !== false
    }

    get can_react():boolean{
        // Whether can react (on an account level)
        return this.profile?.options.allow_reactions !== false
    }

    get can_respond(){
        // Whether allowed to enable responses at all for this section
        return (this.can_comment || this.can_react) && this.section.content.type !== 'page'
    }

    toggle_respondable():void{
        // Toggle, resolving null to opposite of whatever is current final (can't go back to null)
        this.section.respondable = !this.respondable_final
        void self.app_db.sections.set(this.section)
    }

}

</script>


<style lang='sass' scoped>

.respondbar:not(.respondable)
    margin: 0  // Reduce space taken up since won't exist when published

.show:not(:hover)
    opacity: 0.3

</style>
