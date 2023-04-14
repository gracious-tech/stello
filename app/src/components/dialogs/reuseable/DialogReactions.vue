
<template lang='pug'>

v-card

    v-card-title Chose which reactions readers can use

    v-card-text(:class='{maxed: chosen.length >= limit}')
        div(v-for='group of possibilities')
            SharedSvgAnimated.reaction(v-for='reaction of group' :key='reaction'
                :url='reaction_url(reaction)' :playing='false'
                :class='{chosen: chosen.includes(reaction)}' @click.native='choose(reaction)')

    v-card-actions
        app-btn(@click='$emit("close")') Cancel
        app-btn(@click='apply') Apply

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedSvgAnimated from '@/shared/SharedSvgAnimated.vue'
import {reaction_url} from '@/shared/shared_functions'
import {remove_item} from '@/services/utils/arrays'


@Component({
    components: {SharedSvgAnimated},
})
export default class extends Vue {

    @Prop({type: Array, required: true}) declare readonly reaction_options:string[]

    possibilities = [
        // Positive
        ['like', 'love', 'smile', 'heart_eyes', 'star_struck', 'peace'],
        // Celebrate
        ['yay', 'party', 'clap', 'celebrate', 'cheers', 'cowboy'],
        // Humour
        ['laugh', 'lol', 'silly', 'drool', 'yum', 'melt'],
        // Impressed
        ['wow', 'mind_blown', 'cool', 'money', 'fire', 'muscle'],
        // Negative
        ['sad', 'disappointed', 'cry', 'grimace', 'angry', 'dislike'],
        // Other
        ['pray', 'crossed_fingers', 'evil', 'poo', 'crash', 'emergency'],
    ]

    chosen:string[] = []

    reaction_url = reaction_url
    limit = 10

    created(){
        this.chosen = [...this.reaction_options]
    }

    choose(reaction:string){
        if (this.chosen.includes(reaction)){
            remove_item(this.chosen, reaction)
        } else if (this.chosen.length < this.limit){
            this.chosen.push(reaction)
        }
    }

    apply(){
        // Create new list with chosen reactions sorted in same order as in possibilities
        const sorted = []
        for (const reaction of this.possibilities.flat()){
            if (this.chosen.includes(reaction)){
                sorted.push(reaction)
            }
        }
        // NOTE Ensure always at least one (like)
        this.$emit('close', sorted.length ? sorted : ['like'])
    }
}

</script>


<style lang='sass' scoped>

.v-card__text
    display: flex
    flex-wrap: wrap
    justify-content: space-around

    &.maxed .reaction:not(.chosen)
        filter: grayscale(1)

.reaction
    width: 48px !important
    height: 48px !important
    margin-bottom: 12px
    cursor: pointer
    border-radius: 12px

    &.chosen
        background-color: hsla(180, 50%, 50%, 20%)

</style>
