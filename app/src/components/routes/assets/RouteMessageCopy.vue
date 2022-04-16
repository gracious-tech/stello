
<template lang='pug'>

v-list-item

    //- NOTE data-tip doesn't work directly on <svg> so must be on container
    v-list-item-action(:data-tip='status_tip')
        app-btn(v-if='copy.status === "manual"' @click='copy_invite_and_mark' :icon='status_icon'
            :disabled='!profile')
        app-btn(v-else-if='copy.status === "invalid_address"' :to='to' :icon='status_icon'
            color='error')
        app-svg(v-else :name='`icon_${status_icon}`' :class='status_class' class='mx-3')

    v-list-item-content
        v-list-item-title
            router-link(:to='to') {{ copy.display }}

    v-list-item-action(title='Number of times opened' class='noselect') {{ reads.length }}

    v-list-item-action(class='ml-0')
        app-menu-more(v-if='profile')
            app-list-item(@click='copy_invite' :disabled='copy.expired || !copy.uploaded')
                | Copy invite
            app-list-item(@click='retract' :disabled='copy.expired' class='error--text') Retract

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Read} from '@/services/database/reads'
import {Profile} from '@/services/database/profiles'
import {MessageCopy} from '@/services/database/copies'
import {get_text_invite_for_copy} from '@/services/misc/invites'


@Component({})
export default class extends Vue {

    @Prop({type: Object, required: true}) declare readonly copy:MessageCopy
    @Prop({type: Array, required: true}) declare readonly reads:Read[]
    @Prop({type: Object, default: null}) declare readonly profile:Profile|null

    get to(){
        // Route config for viewing the contact
        return {name: 'contact', params: {contact_id: this.copy.contact_id}}
    }

    get status_icon(){
        // An icon to represent the sending status of the copy
        if (this.copy.status === 'invited')
            return 'check_circle'
        if (this.copy.status === 'expired')
            return 'delete'
        if (this.copy.status === 'invalid_address')
            return 'cancel_schedule_send'
        if (this.copy.status === 'pending_send')
            return 'schedule_send'
        if (this.copy.status === 'manual')
            return 'mark_chat_read'
        return 'pending'
    }

    get status_class(){
        // Some statuses need special styling
        if (this.copy.status === 'invited')
            return 'accent--text'
        if (this.copy.status === 'invalid_address')
            return 'error--text'
        if (this.copy.status === 'pending_upload' || this.copy.status === 'expired')
            return 'text--secondary'
        return null
    }

    get status_tip(){
        // Explain what the status means
        if (this.copy.status === 'invited')
            return "Message has been sent"
        if (this.copy.status === 'expired')
            return "Message has expired"
        if (this.copy.status === 'invalid_address')
            return "Change email address"
        if (this.copy.status === 'pending_send')
            return "Waiting to send"
        if (this.copy.status === 'pending_upload')
            return "Message not ready yet"
        if (this.copy.status === 'manual')
            return "Copy invite and mark as sent"
        return ''
    }

    async copy_invite(){
        // Copy a text-form invite to the clipboard
        const text = await get_text_invite_for_copy(this.copy)
        void self.navigator.clipboard.writeText(text)
        void this.$store.dispatch('show_snackbar',
            `Invite copied (now paste in a message to ${this.copy.contact_name})`)
    }

    async copy_invite_and_mark(){
        // Both copy invite and mark as sent

        // Update current instance of copy before save (in case changes)
        Object.assign(this.copy, await self.app_db.copies.get(this.copy.id))

        // Update invited prop
        this.copy.invited = true
        void self.app_db.copies.set(this.copy)

        // Copy invite
        void this.copy_invite()
    }

    async retract(){
        // Retract the copy
        const host_user = await self.app_db.new_host_user(this.profile!)
        await host_user.delete_file(`copies/${this.copy.id}`)
        await host_user.delete_file(`invite_images/${this.copy.id}`)

        // Update current instance of copy before save (in case changes)
        Object.assign(this.copy, await self.app_db.copies.get(this.copy.id))

        // Update expired and save to db
        this.copy.expired = true
        void self.app_db.copies.set(this.copy)
    }
}

</script>


<style lang='sass' scoped>


.v-list-item

    [data-tip]::after
        // Place tooltip bottom right so not hidden by surroundings and doesn't cover contact name
        top: 50px
        left: 50px

    ::v-deep .menu-more-btn
        visibility: hidden

    &:hover, &:focus-within
        background-color: rgba(#888, 0.2)

        ::v-deep .menu-more-btn
            visibility: visible

    .v-list-item__title a
        color: inherit !important  // Don't give usual accent color as confusing next to status icon


</style>
