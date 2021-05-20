
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-content
        v-list-item-title {{ msg.display }}
        v-list-item-subtitle {{ recipients }}
    div.right(class='text-right')
        div(:title='published_exact' class='text--secondary')
            | {{ published_relative }}
        div.expires(v-if='expires' class='mt-1') {{ expires }}
    v-list-item-action
        app-menu-more
            app-list-item(@click='copy') Copy to new draft
            app-list-item(@click='retract' :disabled='msg.expired' color='error')
                | {{ retract_label }}
            app-list-item(@click='remove' color='error') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogGenericConfirm from '@/components/dialogs/generic/DialogGenericConfirm.vue'
import {Draft} from '@/services/database/drafts'
import {Message} from '@/services/database/messages'
import {time_between} from '@/services/misc'


@Component({})
export default class extends Vue {

    @Prop() msg:Message
    @Prop() recipients:string

    get to(){
        return {name: 'message', params: {msg_id: this.msg.id}}
    }

    get published_relative(){
        // Get human fiendly published date string relative to now
        return time_between(this.msg.published)
    }

    get published_exact(){
        // Get human fiendly exact published date string
        return this.msg.published.toLocaleString()
    }

    get retract_label():string{
        // Get most appropriate text for retract button label
        if (this.msg.expired || !this.msg.probably_expired){
            return "Retract"
        }
        return "Retract (confirm expired)"
    }

    get expires():string{
        // A useful description of the msg's expiry time
        if (this.msg.probably_expired){
            return "Expired"
        } else if (this.msg.expires){
            return `Expires in ${this.msg.safe_lifespan_remaining} days`
        }
        return null
    }

    async copy(){
        const copy = await self._db.draft_copy(new Draft(this.msg.draft), false)
        this.$router.push({name: 'draft', params: {draft_id: copy.id}})
    }

    async retract(){
        // Remove a message from server
        if (!this.msg.probably_expired){
            const confirmed = await this.$store.dispatch('show_dialog', {
                component: DialogGenericConfirm,
                props: {
                    title: "All your recipients will lose access to this message",
                    confirm: "Retract",
                    confirm_danger: true,
                },
            })
            if (!confirmed){
                return
            }
        }

        // Retract the message
        const task = await this.$tm.start('retract_message', [this.msg.id], [false])
        const error = await task.done
        if (!error){
            this.msg.expired = true  // Reflect change already made to msg in db
        }
    }

    async remove(){
        // Remove a message from server and Stello
        if (!this.msg.probably_expired){
            const confirmed = await this.$store.dispatch('show_dialog', {
                component: DialogGenericConfirm,
                props: {
                    title: "Message will be deleted for both you and your recipients",
                    confirm: "Delete",
                    confirm_danger: true,
                },
            })
            if (!confirmed){
                return
            }
        }

        // Retract and then delete the message
        // NOTE Parent component responsible for detecting a successful delete
        this.$tm.start('retract_message', [this.msg.id], [true])
    }

}

</script>


<style lang='sass' scoped>


.v-list-item

    ::v-deep .menu-more-btn
        visibility: hidden

    &:hover ::v-deep .menu-more-btn
        visibility: visible

    .right
        font-size: 12px

        .expires
            display: inline-block
            background-color: rgba(#888888, 0.5)
            border-radius: 12px
            padding: 4px 8px


</style>
