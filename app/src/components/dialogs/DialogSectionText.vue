
<template lang='pug'>

v-card

    v-card-title Display Options

    v-card-text

        v-radio-group.standout(v-model='standout' label="Standout")
            //- WARN Vuetify doesn't handle null properly so string is converted when saved
            //- See https://github.com/vuetifyjs/vuetify/issues/8876
            v-radio.null(value='null' label="Normal")
            v-radio.distinct(value='distinct' label="Distinct")
            v-radio.notice(value='notice' label="Notice")
            v-radio.important(value='important' label="Important")

        p * Only normal text will wrap around other content (as standout text will be in a box)

    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Section} from '@/services/database/sections'
import {ContentText} from '@/services/database/types'


@Component({})
export default class extends Vue {

    @Prop() declare readonly section:Section<ContentText>

    get standout(){
        return this.section.content.standout || 'null'
    }

    set standout(value){
        this.section.content.standout = value === 'null' ? null : value
        void self.app_db.sections.set(this.section)
    }

    dismiss(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.standout
    .v-radio
        padding: 12px !important
        margin: 6px 0

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
