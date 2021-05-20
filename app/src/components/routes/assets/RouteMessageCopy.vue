
<template lang='pug'>

v-list-item

    v-list-item-action
        v-tooltip(v-if='copy.status === "manual"' right)
            | Copy invite and mark as sent
            template(#activator='tooltip')
                app-btn(@click='copy_invite_and_mark' v-bind='tooltip.attrs' v-on='tooltip.on'
                    :icon='status_icon')
        app-svg(v-else :name='`icon_${status_icon}`' :class='status_class' class='mx-3')

    v-list-item-content
        v-list-item-title
            router-link(:to='to') {{ copy.display }}

    v-list-item-action(title='Number of times opened') {{ reads.length }}

    v-list-item-action(class='ml-0')
        app-menu-more
            app-list-item(@click='copy_invite' :disabled='copy.expired') Copy invite
            app-list-item(@click='retract' :disabled='copy.expired' color='error') Retract

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Read} from '@/services/database/reads'
import {Profile} from '@/services/database/profiles'
import {MessageCopy} from '@/services/database/copies'
import {get_text_invite_for_copy} from '@/services/misc/invites'


@Component({})
export default class extends Vue {

    @Prop({type: Object, required: true}) copy:MessageCopy
    @Prop({type: Array, required: true}) reads:Read[]
    @Prop({type: Object}) profile:Profile|null

    get to(){
        // Route config for viewing the contact
        return {name: 'contact', params: {contact_id: this.copy.contact_id}}
    }

    get status_icon(){
        // An icon to represent the sending status of the copy
        if (this.copy.status === 'expired')
            return 'delete'
        if (this.copy.status === 'manual')
            return 'mark_chat_read'
        if (this.copy.status === 'error')
            return 'error'
        if (this.copy.status === 'success')
            return 'check_circle'
        return 'help'
    }

    get status_class(){
        // Some statuses need special styling
        if (this.copy.status === 'success')
            return 'accent--text'
        if (this.copy.status === 'error')
            return 'error--text'
        if (this.copy.status === 'expired')
            return 'text--secondary'
        return null
    }

    async copy_invite(){
        // Copy a text-form invite to the clipboard
        const text = await get_text_invite_for_copy(this.copy)
        self.navigator.clipboard.writeText(text)
        this.$store.dispatch('show_snackbar',
            `Invite copied (now paste in a message to ${this.copy.contact_name})`)
    }

    async copy_invite_and_mark(){
        // Both copy invite and mark as sent

        // Update current instance of copy before save (in case changes)
        Object.assign(this.copy, await self._db.copies.get(this.copy.id))

        // Update invited prop
        this.copy.invited = true
        self._db.copies.set(this.copy)

        // Copy invite
        this.copy_invite()
    }

    async retract(){
        // Retract the copy
        if (!this.profile){
            this.$store.dispatch('show_snackbar',
                "Cannot retract message as no longer have access to the sending account")
            return
        }
        await this.profile.new_host_user().delete_file(`copies/${this.copy.id}`)

        // Update current instance of copy before save (in case changes)
        Object.assign(this.copy, await self._db.copies.get(this.copy.id))

        // Update expired and save to db
        this.copy.expired = true
        self._db.copies.set(this.copy)
    }
}

</script>


<style lang='sass' scoped>


.v-list-item

    ::v-deep .menu-more-btn
        visibility: hidden

    &:hover, &:focus-within
        background-color: rgba(#888, 0.2)

        ::v-deep .menu-more-btn
            visibility: visible

    .v-list-item__title a
        color: inherit !important  // Don't give usual accent color as confusing next to status icon


</style>
