
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-content
        v-list-item-title
            | {{ draft.display }}
    v-list-item-action(class='flex-row align-center')
        v-chip(v-if='is_default' small class='mr-3') default
        v-tooltip(v-if='draft.template' top)
            | Use for new draft
            template(#activator='tooltip')
                app-btn(v-bind='tooltip.attrs' v-on='tooltip.on' @click.prevent='copy' icon='post_add')
        app-menu-more
            app-list-item(v-if='!draft.template' @click='copy') Duplicate
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

    async copy(){
        const copy = await self._db.draft_copy(this.draft.id)
        this.$emit('copied', copy)
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
