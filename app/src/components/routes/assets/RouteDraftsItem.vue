
<template lang='pug'>

v-list-item(:to='to')
    v-list-item-content
        v-list-item-title
            | {{ draft.display }}
            v-chip(v-if='is_default' small class='ml-5') default
    v-list-item-action(v-if='draft.template')
        app-btn(@click.prevent='copy' icon='post_add')
    v-list-item-action
        app-menu-more
            app-list-item(v-if='!draft.template' @click='copy') Copy
            app-list-item(v-if='!draft.template' @click='make_template') Turn into template
            app-list-item(v-if='draft.template' @click='make_default_template') Make default
            app-list-item(@click='remove') Remove

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
        this.$emit('removed', this.draft.id)
    }

}

</script>


<style lang='sass' scoped>


</style>
