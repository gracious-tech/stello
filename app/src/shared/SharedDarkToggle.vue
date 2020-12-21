
<template lang='pug'>

div(@click='toggle')
    svg(:style='{fill}')
        path(d='M17.66 7.93L12 2.27 6.34 7.93c-3.12 3.12-3.12 8.19 0 11.31C7.9 20.8 9.95 21.58 12 21.58c2.05 0 4.1-.78 5.66-2.34 3.12-3.12 3.12-8.19 0-11.31zM12 19.59c-1.6 0-3.11-.62-4.24-1.76C6.62 16.69 6 15.19 6 13.59s.62-3.11 1.76-4.24L12 5.1v14.49z')

</template>


<script lang='ts'>

export default {

    props: {
        value: {
            type: Boolean,
        },
    },

    computed: {
        fill(){
            return this.value ? 'white' : 'black'
        },
    },

    methods: {
        toggle(){
            this.$emit('input', !this.value)
        },
    },
}

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

    &:hover
        cursor: pointer
        opacity: 1

</style>
