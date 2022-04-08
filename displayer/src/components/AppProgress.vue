
<template lang='pug'>

svg.loading(viewBox='0 0 100 100' preserveAspectRatio='xMidYMid meet')
    circle(cx='50' cy='50' r='40' stroke-width='10' stroke-dasharray='190')

</template>


<style lang='sass' scoped>

svg.loading circle
    stroke: var(--stello-hue-heavy)  // Overrides index.pug value

</style>
