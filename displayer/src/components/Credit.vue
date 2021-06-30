
<template lang='pug'>

p.credit
    | Created with
    |
    a(href='https://stello.news/' target='_blank') {{ app_name }}

</template>


<script lang='ts'>

import app_config from '../app_config.json'

export default {
    setup(){
        return {
            app_name: app_config.name,
        }
    }
}

</script>


<style lang='sass' scoped>

.credit
    text-align: center
    opacity: 0.3
    font-size: 13px
    margin: 100px 0
    font-family: Roboto, sans-serif
    user-select: none

    a
        color: inherit !important  // Don't stand out

</style>
