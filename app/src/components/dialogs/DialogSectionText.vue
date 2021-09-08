
<template lang='pug'>

v-card

    v-card-title Display Options

    v-card-text

        v-radio-group.standout(v-model='standout' label="Standout")
            //- WARN Vuetify doesn't handle null properly so string is converted when saved
            //- See https://github.com/vuetifyjs/vuetify/issues/8876
            v-radio.subtle(value='subtle' label="Subtle")
            v-radio.null(value='null' label="Normal")
            v-radio.distinct(value='distinct' label="Distinct")
            v-radio.notice(value='notice' label="Notice")
            v-radio.important(value='important' label="Important")

        p When normal text is placed next to other content it will wrap around it, where as other styles will not.

    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Section} from '@/services/database/sections'
import {ContentText} from '@/services/database/types'


@Component({})
export default class extends Vue {

    @Prop() section:Section<ContentText>

    get standout(){
        return this.section.content.standout || 'null'
    }

    set standout(value){
        this.section.content.standout = value === 'null' ? null : value
        self.app_db.sections.set(this.section)
    }

    dismiss(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

@import 'src/shared/shared_mixins.sass'


.standout
    .v-radio
        padding: 12px !important
        margin: 6px 0

        &.subtle
            @include standout-subtle
        &.distinct
            @include standout-distinct
        &.notice
            @include standout-notice
            &.theme--dark
                @include standout-notice-dark
        &.important
            @include standout-important
            &.theme--dark
                @include standout-important-dark

</style>
