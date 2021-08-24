
<template lang='pug'>

app-svg(name='logo' responsive)

</template>


<script></script>


<style lang='sass' scoped>

// Make greek appear on hover
::v-deep
    #greek
        transition: opacity 1s ease-out
    &:not(:hover) #greek
        opacity: 0

</style>
