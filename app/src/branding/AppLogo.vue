
<template lang='pug'>

app-svg(name='logo' :shrinkable='false')

</template>


<style lang='sass' scoped>

// Make greek appear on hover
::v-deep
    #greek
        transition: fill-opacity 1s ease-out
    &:not(:hover) #greek
        fill-opacity: 0

</style>
