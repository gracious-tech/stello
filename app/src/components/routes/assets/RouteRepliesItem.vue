
<template lang='pug'>

v-card(:class='{read: replaction.read}')
    div.section_image(v-if='section_image' :style='{"background-image": `url(${section_image})`}')
    div.main
        div.horiz
            div.text
                v-card-title(v-if='!reactions') {{ title }}
                v-card-subtitle(v-if='!section_image') {{ subtitle }}
                v-card-text
                    template(v-if='reactions')
                        div.reaction(v-for='type of reaction_types' v-if='reactions_ui[type].length')
                            div.badge
                                img(:src='reaction_images[type]')
                                | {{ reactions_ui[type].length }}
                            | {{ reactions_ui[type].join(', ') }}
                    template(v-else) {{ replaction.content }}
            div.actions
                app-btn(@click='toggle_read' icon='done')
                app-menu-more
                    app-list-item(@click='remove') Delete
        div.sent(class='text--secondary') {{ replaction.sent.toLocaleString() }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Reply} from '@/services/database/replies'
import {Reaction} from '@/services/database/reactions'
import {Section} from '@/services/database/sections'
import {trusted_html_to_text} from '@/services/utils/coding'


// Define reaction types and get webpack to import the images (can't do at runtime)
const REACTION_TYPES = ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad']
const REACTION_IMAGES = {
    like: require('@/shared/reactions/like.png'),
    love: require('@/shared/reactions/love.png'),
    yay: require('@/shared/reactions/yay.png'),
    pray: require('@/shared/reactions/pray.png'),
    laugh: require('@/shared/reactions/laugh.png'),
    wow: require('@/shared/reactions/wow.png'),
    sad: require('@/shared/reactions/sad.png'),
}


@Component({})
export default class extends Vue {

    @Prop() replaction:Reply|Reaction
    @Prop() reactions:Reaction[]

    section:Section = null
    reaction_types = REACTION_TYPES
    reaction_images = REACTION_IMAGES

    async created(){
        this.section = await self._db.sections.get(this.replaction.section_id)
    }

    get title(){
        return `From: ${this.replaction.contact_name}`
    }

    get subtitle(){
        return `Re: ${this.section_hint}`
    }

    get section_hint(){
        let hint = ''
        if (this.section){
            if (this.section.content.type === 'text'){
                hint = trusted_html_to_text(this.section.content.html)
            }
            if (this.section.content.type === 'images'){
                hint = this.section.content.images[0].caption
            }
        }
        return hint.trim() || `Section #${this.replaction.section_num + 1}`
    }

    get section_image(){
        if (this.section?.content.type === 'images'){
            return URL.createObjectURL(this.section.content.images[0].data)
        }
    }

    get reactions_ui(){
        // Return reactions in format suitable for display in UI

        // Sort reactions by type and represent by contact's name
        const names = {}
        for (const type of REACTION_TYPES){
            names[type] = []
        }

        // Keep track of contacts so only count latest from each
        const contacts = []

        for (const reaction of this.reactions){
            if (! (reaction.content in names)){
                continue  // Invalid or old reaction type
            }
            if (contacts.includes(reaction.contact_id)){
                continue  // Only count latest reaction from each contact
            }
            names[reaction.content].push(reaction.contact_name)
            contacts.push(reaction.contact_id)
        }
        return names
    }

    toggle_read(){
        // Mark the reply or reactions as read
        if (this.reactions){
            const desired = !this.replaction.read
            for (const reaction of this.reactions){
                if (reaction.read !== desired){
                    reaction.read = desired
                    self._db.reactions.set(reaction)
                }
            }
        } else {
            this.replaction.read = !this.replaction.read
            self._db.replies.set(this.replaction as Reply)
        }
    }

    async remove(){
        // Remove the reply or the reactions
        const promises = []
        if (this.reactions){
            for (const reaction of this.reactions){
                promises.push(self._db.reactions.remove(reaction.id))
            }
        } else {
            promises.push(self._db.replies.remove(this.replaction.id))
        }
        await Promise.all(promises)
        this.$emit('removed', this.replaction.id)
    }

}

</script>


<style lang='sass' scoped>

.v-card
    margin: 24px 0
    display: flex

    &.read
        opacity: 0.5

.section_image
    flex-grow: 0.3
    flex-basis: 1px
    background-size: cover
    background-position: center
    background-repeat: no-repeat

.main
    flex-grow: 1
    flex-basis: 1px
    width: 1px

.horiz
    display: flex

.text
    flex-grow: 1
    width: 1px

.v-card__subtitle
    white-space: nowrap
    overflow-x: hidden
    text-overflow: ellipsis


.v-card__text
    white-space: pre-wrap

.reaction
    display: flex
    align-items: center
    margin-bottom: 12px

    .badge
        @include themed(background-color, #0002, #fff3)
        display: inline-flex
        align-items: center
        padding: 4px 8px 4px 6px
        border-radius: 6px
        margin-right: 12px

        img
            display: inline
            height: 24px
            width: 24px
            margin-right: 6px

.sent
    text-align: right
    font-size: 12px
    padding: 12px


.actions
    display: flex
    flex-direction: column

</style>
