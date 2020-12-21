
<template lang='pug'>

div.badge &nbsp;

</template>


<script lang='ts'>

// A textless badge to draw attention to an icon
// NOTE Currently not used; code kept here as reusable component for future availability

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {}

</script>


<style lang='sass' scoped>


@keyframes badge-delayed-appearance
    // Simulate a delayed start to animation by doing nothing for first 70%
    // NOTE Delaying actual start to animation will make badge appear, then disappear and ease in
    0%
        transform: scale(0)
    70%
        transform: scale(0)
        // Specifying timing here at point when animation should actually start
        // NOTE Not sure if this is working correctly or not though!
        animation-timing-function: cubic-bezier(0.25, 0.8, 0.5, 1)
    100%
        transform: scale(100%)

.badge
    position: absolute
    top: -3px
    right: 12px
    height: 10px
    width: 10px
    background-color: $accent
    border-radius: 5px
    animation-duration: 1s  // Actual animation 0.3 seconds when starts at keyframe 70%
    animation-name: badge-delayed-appearance


</style>
