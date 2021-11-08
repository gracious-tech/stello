
<template lang='pug'>

div.srow(ref='row_element' :class='row.display')
    div.sections
        MessageSection(v-for='section of row.sections' :key='section.id' :section='section')

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
        zindex: {
            type: Number,
            required: true,
        },
    },

    setup(props){
        // Set zIndex of row whenever the prop changes
        const row_element = ref<HTMLDivElement>()
        onMounted(() => {
            watch(
                () => props.zindex,
                value => {row_element.value!.style.zIndex = String(value)},
                {immediate: true},
            )
        })
        return {row_element}
    },
})

</script>


<style lang='sass' scoped>

</style>
