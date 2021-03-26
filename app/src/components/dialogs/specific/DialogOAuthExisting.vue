
<template lang='pug'>

v-card

    v-card-title Choose {{ display_issuer }} account

    v-card-text
        v-list
            app-list-item(v-for='oauth of oauths' @click='$emit("close", oauth)')
                app-svg(:name='`icon_${issuer}`')
                | {{oauth.display}}
            app-list-item(@click='$emit("close", null)') Other

    v-card-actions
        app-btn(@click='$emit("close")') Cancel

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {OAuth} from '@/services/database/oauths'


@Component({})
export default class extends Vue {

    @Prop() oauths:OAuth[]  // NOTE These are all of the same issuer

    get issuer():string{
        // Only ever one issuer and always at least one oauth, so retrieve from first item
        return this.oauths[0].issuer
    }

    get display_issuer():string{
        return this.oauths[0].display_issuer
    }
}

</script>


<style lang='sass' scoped>


::v-deep .v-list-item__title
    display: flex

    svg
        margin-right: 12px


</style>
