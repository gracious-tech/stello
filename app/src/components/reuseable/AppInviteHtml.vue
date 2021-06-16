
<template lang='pug'>

div.root(:style='container_styles')
    app-html.input(ref='editor' :value='value' :variables='variables' @input='$emit("input", $event)')
    div.action(v-html='action_html')

</template>


<script lang='ts'>

import {Component, Prop, Vue} from 'vue-property-decorator'

import {gen_variable_items} from '@/services/misc/templates'
import {INVITE_HTML_CONTAINER_STYLES, render_invite_html_action} from '@/services/misc/invites'
import {Profile} from '@/services/database/profiles'


@Component({})
export default class extends Vue {

    @Prop(String) value:string
    @Prop({type: Object, required: true}) profile:Profile

    container_styles = INVITE_HTML_CONTAINER_STYLES

    get variables(){
        // Get template variables with actual and example data (where needed)
        return gen_variable_items(
            null, null, this.profile.msg_options_identity.sender_name, null, new Date(),
            this.profile.msg_options_security.max_reads, this.profile.msg_options_security.lifespan,
        )
    }

    get action_html(){
        // Get the html needed to render the action footer
        return render_invite_html_action("Example Message Subject", "")
    }
}

</script>


<style lang='sass' scoped>

.root
    margin: 12px 0 !important

.input
    padding: 24px

.action
    pointer-events: none  // Don't allow clicking open button

</style>
