
<template lang='pug'>

div.srow(ref='row_element' :class='{[row.display]: true, hero: row.hero}')
    div.sections
        MessageSection(v-for='section of row.sections' :key='section.id' :section='section'
            :first_hero='index === 0 && row.hero')

</template>


<script lang='ts'>

import {PropType, defineComponent, watch, onMounted, ref} from 'vue'

import MessageSection from './MessageSection.vue'
import {RowDisplay} from '@/shared/shared_functions'
import {PublishedSection} from '@/shared/shared_types'


export default defineComponent({

    components: {MessageSection},

    props: {
        row: {
            type: Object as PropType<RowDisplay<PublishedSection>>,
            required: true,
        },
        index: {
            type: Number,
            required: true,
        },
    },

    setup(props){
        // Set zIndex of row whenever the prop changes
        // Gives each srow a higher z-index than the next, so respond popups can overlap below
        // TODO If wrapping text shorter than wrapped section, popups will appear underneath
        const row_element = ref<HTMLDivElement>()
        onMounted(() => {
            watch(
                () => props.index,
                value => {row_element.value!.style.zIndex = String(99 - value)},
                {immediate: true},
            )
        })
        return {row_element}
    },
})

</script>


<style lang='sass' scoped>

</style>
