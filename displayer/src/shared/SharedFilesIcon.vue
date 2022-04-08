
<template lang='pug'>

//- NOTE .icon class gets styles from displayer stylesheet
svg.icon(viewBox='0 0 24 24')
    path(:d='icon')

</template>


<script lang='ts'>

import {defineComponent} from 'vue-demi'


export default defineComponent({

    props: {
        download: {
            type: Boolean,
            required: true,
        },
    },

    computed: {
        icon(){
            if (this.download){
                return 'M5,20h14v-2H5V20z M19,9h-4V3H9v6H5l7,7L19,9z'
            }
            return `M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9
                2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z`
        },
    },
})

</script>


<style lang='sass' scoped>

</style>
