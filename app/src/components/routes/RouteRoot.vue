
<template lang='pug'>

div

    div(class='release-banner') ALPHA

    v-toolbar(color='primary' dark)

        v-toolbar-title
            app-logo

        v-spacer

        app-btn(to='settings/' icon='settings')
        app-menu-more
            v-list-item(to='about/')
                v-list-item-content
                    v-list-item-title About

    app-content(class='pa-3')
        img.decor(src='_assets/decor_root.svg')
        p(class='text-center')
            app-btn(@click='new_draft')
                | {{ default_template_exists ? "Use default template" : "Create new message" }}
        p(class='my-6 text-center')
            app-btn(to='contacts/' color='') Contacts
            app-btn(to='drafts/' color='') Drafts
            app-btn(to='messages/' color='') Sent
            app-btn(to='replies/' color='') Replies
        div.support
            div.support-inner
                h3(class='text-h6') Still to come
                ul
                    li Adding videos/graphs/subpages
                    li Editing messages after sending
                    li Change style of messages
                app-btn(href='https://give.gracious.tech' color='#fa5788' raised small) Help us

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'

import AppLogo from '@/branding/AppLogo.vue'


@Component({
    components: {AppLogo},
})
export default class extends Vue {

    default_template_exists = false

    async created(){
        // Confirm whether default template exists
        const default_id = this.$store.state.default_template
        if (default_id && await self._db.drafts.get(default_id)){
            this.default_template_exists = true
        }
    }

    async new_draft(){
        // Create a new draft and navigate to it
        let draft
        if (this.default_template_exists){
            draft = await self._db.draft_copy(this.$store.state.default_template)
        } else {
            draft = await self._db.drafts.create()
        }
        this.$router.push({name: 'draft', params: {draft_id: draft.id}})
    }

}

</script>


<style lang='sass' scoped>


.decor
    width: 100%
    max-width: 393px
    margin: 48px auto


.support
    display: flex
    justify-content: center

    .support-inner
        display: inline-flex
        flex-direction: column
        margin-top: 100px
        border-radius: 12px
        padding: 24px
        width: auto
        align-items: center
        @include themed(background-color, #0001, #fff1)

        > *
            margin: 12px 0

</style>
