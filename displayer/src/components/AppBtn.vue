
<template lang='pug'>

button(v-bind='$attrs' :class='{error, progress}' :disabled='disabled || progress' class='btn-text')
    AppProgress.AppProgress
    //- WARN Parent div required for grid positioning
    div.contents
        slot

</template>


<script lang='ts'>

import {defineComponent} from 'vue'


export default defineComponent({

    props: {
        progress: {
            type: Boolean,
            default: false,
        },
        error: {
            type: Boolean,
            default: false,
        },
        disabled: {
            type: Boolean,
            default: false,
        },
    },

    setup(){
        return {}
    },
})

</script>


<style lang='sass' scoped>

button
    display: inline-grid !important
    justify-items: center

    > *
        grid-area: 1/1

    &.error
        background-color: rgba(#f00, 0.3) !important

    &.progress
        .contents
            visibility: hidden

    .AppProgress
        width: 20px
        height: 20px

        :deep(circle)
            stroke: currentColor !important

    &:not(.progress) .AppProgress
        display: none

</style>
