
<template lang='pug'>

button.respond(v-bind='$attrs' v-on='listeners' class='btn-text')
    slot
        svg(viewBox='0 0 24 24' class='borderless')
            path(d='M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z')
    | React

</template>


<script lang='ts'>
/* eslint-disable vue/no-deprecated-dollar-listeners-api -- Needed for Vue 2 */

import {defineComponent} from 'vue-demi'


export default defineComponent({
    computed: {
        listeners():unknown{
            // @ts-ignore $listeners doesn't exist in Vue 3
            return this.$listeners ?? {}
        },
    },
})

</script>


<style lang='sass' scoped>


</style>
