
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-content
        v-list-item-title
            | {{ draft.display }}
    v-list-item-action(class='flex-row align-center')
        v-chip(v-if='is_default' small class='mr-3') default
        app-btn(v-if='draft.template' @click.prevent='copy_to_draft' icon='post_add'
            data-tip="Use for new draft")
        app-menu-more
            app-list-item(@click='duplicate') Duplicate
            app-list-item(v-if='!draft.template' @click='make_template') Turn into template
            app-list-item(v-if='draft.template' @click='make_default_template'
                :disabled='is_default') Make default
            app-list-item(@click='remove' color='error') Delete

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Draft} from '@/services/database/drafts'


@Component({})
export default class extends Vue {

    @Prop() draft:Draft

    get to(){
        return {name: 'draft', params: {draft_id: this.draft.id}}
    }

    get is_default(){
        // Whether this template is the default one
        return this.draft.id === this.$store.state.default_template
    }

    async copy(template?:boolean){
        // Duplicate the draft or template
        const copy = await self._db.draft_copy(this.draft.id, template)
        this.$emit('copied', copy)
    }

    duplicate(event){
        // Duplicate a draft or template
        this.copy()
    }

    copy_to_draft(event){
        // Copy a template as a new draft
        this.copy(false)
    }

    make_template(){
        // Make this draft a template
        this.draft.template = !this.draft.template
        self._db.drafts.set(this.draft)

        // Make default template if none yet
        if (!this.$store.state.default_template){
            this.make_default_template()
        }
    }

    make_default_template(){
        // Make a template the default
        this.$store.commit('dict_set', ['default_template', this.draft.id])
    }

    remove(){
        self._db.drafts.remove(this.draft.id)
        // If this was the default template, clear it
        if (this.draft.id === this.$store.state.default_template){
            this.$store.commit('dict_set', ['default_template', null])
        }
        this.$emit('removed', this.draft.id)
    }

}

</script>


<style lang='sass' scoped>


</style>
