
<template lang='pug'>

button.respond(v-bind='$attrs' v-on='listeners' class='btn-text')
    svg(viewBox='0 0 24 24' class='borderless')
        path(:d='icon')
    | Comment

</template>


<script lang='ts'>

import {defineComponent} from 'vue-demi'


export default defineComponent({

    props: {
        replied: {
            type: Boolean,
            default: false,
        },
    },

    computed: {
        listeners():unknown{
            // @ts-ignore $listeners doesn't exist in Vue 3
            return this.$listeners ?? {}
        },
        icon(){
            if (this.replied){
                return `M17.34,20l-3.54-3.54l1.41-1.41l2.12,2.12l4.24-4.24L23,14.34L17.34,20z M12,
                    17c0-3.87,3.13-7,7-7c1.08,0,2.09,0.25,3,0.68 V4c0-1.1-0.9-2-2-2H4C2.9,2,2,2.9,
                    2,4v18l4-4h6v0c0-0.17,0.01-0.33,0.03-0.5C12.01,17.34,12,17.17,12,17z`
            }
            return `M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2
                2V4h16v12z`
        },
    },
})

</script>


<style lang='sass' scoped>


</style>
