
<template lang='pug'>

//- NOTE Doesn't need v-on since app doesn't use listeners, and vue 3 includes them in $attrs
button.respond(v-bind='$attrs')
    svg(viewBox='0 0 24 24')
        path(d='M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z')
    | Comment

</template>


<script lang='ts'>

export default {

}

</script>


<style lang='sass' scoped>


</style>
