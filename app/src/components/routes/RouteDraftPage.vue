
<template lang='pug'>

div
    v-toolbar
        app-btn(to='../' icon='arrow_back')
        v-toolbar-title(class='d-flex')
            span {{ pages_title }}
            span(class='ellipsis pl-2') {{ draft_title }}
        v-spacer
        app-menu-more
            app-list-item(@click='delete_page' class='error--text') Cut page

    div.stello-displayer(v-if='draft' :class='displayer_classes' :style='theme_style_props')
        draft-pagebait-editable(:page='page')
        //- WARN `content` ref used by DraftPagebaitEditable
        draft-content(ref='content' :draft='draft' :sections='sections' :profile='profile'
            @save='save')

    app-content(v-else class='text-center pt-10')
        h1(class='text--secondary text-h6') Page does not exist

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DraftContent from './assets/DraftContent.vue'
import DraftPagebaitEditable from './assets/DraftPagebaitEditable.vue'
import {Draft} from '@/services/database/drafts'
import {Section} from '@/services/database/sections'
import {ContentPage} from '@/services/database/types'
import {Profile} from '@/services/database/profiles'
import {rm_section_id} from '@/services/database/utils'
import {gen_theme_style_props} from '@/shared/shared_theme'


@Component({
    components: {DraftContent, DraftPagebaitEditable},
    provide(){
        return {theme_style_props: (this as RouteDraftPage).theme_style_props}
    },
})
export default class RouteDraftPage extends Vue {

    @Prop({type: String, required: true}) declare readonly draft_id:string
    // NOTE Page ids are manually processed due to limitations with Router v3

    draft:Draft|null = null
    page:Section<ContentPage>|null = null
    profile:Profile|null = null
    theme_style_props:Record<string, string> = {}  // Not a getter so stays reactive when provided

    get page_id(){
        // Current page id is always the last item in URL
        return this.$route.path.split('/').at(-2)!  // -2 due to trailing slash
    }

    get parent_page_id(){
        // Get id of parent page (or null if main message)
        const parent = this.$route.path.split('/').at(-3)
        return parent === this.draft_id ? null : parent
    }

    get draft_title(){
        return this.draft?.title ? `“${this.draft.title}”` : "draft"
    }

    get pages_title(){
        // Repeated "Page of page of..." depending on how many levels deep
        const levels = this.$route.path.split('/drafts/')[1]!.split('/').length - 2
        return "Page of ".repeat(levels)
    }

    get dark_message(){
        return this.$store.state.dark_message as boolean
    }

    get theme_style(){
        // Get theme style setting for profile
        return this.profile?.options.theme_style ?? 'modern'
    }

    get displayer_classes(){
        // Classes to add to .stello-displayer div
        return {
            dark: this.dark_message,
            [`style-${this.theme_style}`]: true,
        }
    }

    get sections(){
        return this.page!.content.sections
    }

    async save(){
        // Save changes to page
        await self.app_db.sections.set(this.page!)
    }

    async delete_page(){
        // Delete this page (and store as a cut_section)
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
        const removed_sections = await self.app_db.sections.remove(this.page_id)
        this.$store.commit('tmp_set', ['cut_section', removed_sections])
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

    @Watch('profile', {deep: true, immediate: true}) watch_profile(){
        // CSS style props for theming message
        const color = this.profile?.options.theme_color ??
            self.app_db.profiles.get_default_theme_color()
        const new_values = gen_theme_style_props(this.dark_message, this.theme_style, color)
        for (const [key, val] of Object.entries(new_values)){
            this.$set(this.theme_style_props, key, val)
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
