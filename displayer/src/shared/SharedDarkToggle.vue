
<template lang='pug'>

div(@click='toggle')
    svg(:class='fill')
        path(d='M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-.89 0-1.74-.2-2.5-.55C11.56 16.5 13 14.42 13 12s-1.44-4.5-3.5-5.45C10.26 6.2 11.11 6 12 6c3.31 0 6 2.69 6 6s-2.69 6-6 6z')

</template>


<script lang='ts'>

import {defineComponent} from 'vue-demi'


export default defineComponent({

    props: {
        value: {
            type: Boolean,
            required: true,
        },
    },

    computed: {
        fill():'white'|'black'{
            return this.value ? 'white' : 'black'
        },
    },

    methods: {
        toggle(){
            this.$emit('input', !this.value)
        },
    },
})

</script>


<style lang='sass' scoped>

div
    position: absolute
    right: 0
    margin: 12px
    padding: 12px
    opacity: 0.3
    z-index: 100

    svg
        width: 24px
        height: 24px
        &.black
            fill: black
        &.white
            fill: white

    &:hover
        cursor: pointer
        opacity: 1

</style>
