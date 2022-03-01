
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title Page editor
        v-spacer
        app-menu-more
            app-list-item(@click='delete_page' class='error--text') Delete page

    div.stello-displayer(v-if='draft' :class='{dark: dark_message}')
        draft-pagebait-editable(:page='page' :suggestions='existing_images')
        draft-content(ref='content' :draft='draft' :sections='sections' :profile='profile'
            @save='save')

    app-content(v-else class='text-center pt-10')
        h1(class='text--secondary text-h6') Page does not exist

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import DraftContent from './assets/DraftContent.vue'
import DraftPagebaitEditable from './assets/DraftPagebaitEditable.vue'
import {Draft} from '@/services/database/drafts'
import {Section} from '@/services/database/sections'
import {ContentPage} from '@/services/database/types'
import {Profile} from '@/services/database/profiles'
import {rm_section_id} from '@/services/database/utils'


@Component({
    components: {DraftContent, DraftPagebaitEditable},
})
export default class extends Vue {

    @Prop({type: String, required: true}) declare readonly draft_id:string
    // NOTE Page ids are manually processed due to limitations with Router v3

    draft:Draft|null = null
    page:Section<ContentPage>|null = null
    profile:Profile|null = null

    get page_id(){
        // Current page id is always the last item in URL
        return this.$route.path.split('/').at(-2)!  // -2 due to trailing slash
    }

    get parent_page_id(){
        // Get id of parent page (or null if main message)
        const parent = this.$route.path.split('/').at(-3)
        return parent === this.draft_id ? null : parent
    }

    get dark_message(){
        return this.$store.state.dark_message
    }

    get sections(){
        return this.page!.content.sections
    }

    get existing_images(){
        // Access to existing images used in content sections
        return (this.$refs['content'] as unknown as {existing_images:Blob[]})?.existing_images ?? []
    }

    async save(){
        // Save changes to page
        await self.app_db.sections.set(this.page!)
    }

    async delete_page(){
        // Delete this page
        if (this.parent_page_id){
            // Remove from parent page sections array
            const parent =
                await self.app_db.sections.get(this.parent_page_id) as Section<ContentPage>
            rm_section_id(parent.content.sections, this.page_id)
            await self.app_db.sections.set(parent)
        } else {
            // Remove from draft's sections array
            rm_section_id(this.draft!.sections, this.page_id)
            await self.app_db.drafts.set(this.draft!)
        }
        await self.app_db.sections.remove(this.page_id)
        void this.$router.push('../')
    }

    async created(){
        // Load the draft, the page, and the sections of the page
        const draft = await self.app_db.drafts.get(this.draft_id)
        const page = await self.app_db.sections.get(this.page_id) as Section<ContentPage>
        if (!draft || !page){
            return  // Draft gone or page gone
        }

        // Reveal
        this.page = page
        this.draft = draft

        // Get profile if one set
        if (draft.profile){
            this.profile = await self.app_db.profiles.get(draft.profile) ?? null
        }
    }
}

</script>


<style lang='sass' scoped>


.stello-displayer
    // NOTE Keep same as with RouteDraft
    width: 100%
    flex-grow: 1
    overflow-y: auto
    position: relative

</style>
