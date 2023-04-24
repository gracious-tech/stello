
<template lang='pug'>

v-list-item(@click='copy_url')
    v-list-item-content
        v-list-item-title {{ title }}
        v-list-item-subtitle {{ subtitle }}
    v-list-item-action
        app-menu-more
            app-list-item(@click='edit') Edit
            app-list-item(@click='remove' class='error--text') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DialogSubscribeForm from '@/components/dialogs/reuseable/DialogSubscribeForm.vue'
import {Group} from '@/services/database/groups'
import {OAuth} from '@/services/database/oauths'
import {Profile} from '@/services/database/profiles'
import {SubscribeForm} from '@/services/database/subscribe_forms'
import {export_key} from '@/services/utils/crypt'
import {buffer_to_url64, trusted_html_to_text} from '@/services/utils/coding'


@Component({})
export default class extends Vue {

    @Prop({required: true}) declare readonly profile:Profile
    @Prop({required: true}) declare readonly form:SubscribeForm
    @Prop({required: true}) declare readonly groups:Group[]
    @Prop({required: true}) declare readonly oauths:OAuth[]

    get title(){
        return trusted_html_to_text(this.form.text)
    }

    get subtitle(){
        // Get list of chosen groups as string
        return this.groups.filter(g => this.form.groups.includes(g.id)).map(g => g.display)
            .join(', ')
    }

    async copy_url(){
        // Copy url for form to clipboard and notify user
        const shared64 = buffer_to_url64(await export_key(this.profile.host_state.shared_secret))
        const url = this.profile.view_url(shared64, this.form.id, null, 'sub')
        void self.navigator.clipboard.writeText(url)
        void this.$store.dispatch('show_snackbar', "Link copied (now paste somewhere)")
    }

    edit(){
        void this.$store.dispatch('show_dialog', {
            component: DialogSubscribeForm,
            props: {
                profile: this.profile,
                form: this.form,
                groups: this.groups,
                oauths: this.oauths,
            },
        })
    }

    async remove(){
        await self.app_db.subscribe_forms.remove(this.form.id)
        this.$emit('removed', this.form)
    }

}

</script>


<style lang='sass' scoped>

.v-list-item

    ::v-deep .menu-more-btn
        opacity: 0.1

    &:hover
        ::v-deep .menu-more-btn
            opacity: 1

</style>
