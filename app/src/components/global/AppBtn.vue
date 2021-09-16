<!-- Wrapper for v-btn with better defaults -->

<template lang='pug'>

//- WARN Must be explicit with undefined, since many props are enabled by empty strings
v-btn(
    v-bind='$attrs'
    v-on='$listeners'
    :icon='show_icon && $attrs["fab"] === undefined'
    :text='$attrs["raised"] === undefined && $attrs["outlined"] === undefined && !show_icon'
    :color='color'
    :outlined='$attrs["outlined"] !== undefined && !show_icon'
    :target='$attrs["target"] || ($attrs["href"] && "_blank")'
)
    app-svg(v-if='show_icon' :name='`icon_${icon}`')
    slot(v-else)

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    @Prop({type: String, default: null}) icon

    get color(){
        // Use provided color, else default to accent (unless an icon)
        if ('color' in this.$attrs)
            return this.$attrs['color']
        if (!this.show_icon || 'fab' in this.$attrs)
            return 'accent'
        return null
    }

    get show_icon(){
        // Whether to show icon (and possibly favour over slot contents)
        if (!this.icon)
            return false  // Can't show if no icon
        if (!this.$slots['default'])
            return true  // Always show if no alternate content
        // Otherwise, if both icon and slot content, use icon for narrow screens only
        return this.$store.state.tmp.viewport_width < 600
    }

}

</script>


<style lang='sass' scoped>

.v-btn.accent[raised]
    color: var(--on_accent)  // Correct Vuetify which doesn't account for theme correctly

</style>
