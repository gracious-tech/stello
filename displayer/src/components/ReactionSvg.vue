
<template lang='pug'>

SharedSvgAnimated(
    :url='`displayer/reactions/${reaction}.${reaction === "pray" ? "svg" : "json"}`'
    :class='{chosen}'
)

</template>


<script lang='ts'>

import SharedSvgAnimated from '../shared/SharedSvgAnimated.vue'


export default {

    components: {SharedSvgAnimated},

    props: {
        reaction: {
            type: String,
            required: true,
        },
        chosen: {
            type: Boolean,
            default: false,
        },
    },
}

</script>


<style lang='sass' scoped>

.chosen
    box-shadow: 0 10px 10px -10px rgba(#000, 0.7)

</style>
