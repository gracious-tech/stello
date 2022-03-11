
<template lang='pug'>

div.pagebait-editable
    p(class='caption opacity-secondary') Readers will click this to view the page
    div.pagebait(:class='{"btn-text": button, "s-primary": button}')
        div.image(v-show='!button' ref='image' @click='change_image')
        div.text
            //- NOTE maxlength is more than ideal (so not restrictive) but less than excessive
            textarea.hline(v-model='headline' @keydown.enter.prevent @input='textarea_input'
                maxlength='150' rows='1' :placeholder='button ? "Button..." : "Headline..."')
            textarea.desc(v-if='!button' v-model='desc' @keydown.enter.prevent
                @input='textarea_input' maxlength='400' rows='1' placeholder="Description...")
    div(class='d-flex justify-center align-center ui')
        span Article style
        v-switch(v-model='button' class='ml-4 mr-3')
        span Button style

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import DialogImageChooser from '@/components/dialogs/reuseable/DialogImageChooser.vue'
import {Section} from '@/services/database/sections'
import {ContentPage} from '@/services/database/types'
import {SECTION_IMAGE_WIDTH} from '@/services/misc'


// Generate a placeholder image
const PLACEHOLDER = URL.createObjectURL(
    new Blob(
        [`
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="24" viewBox="0 0 48 24">
            <path fill="#00000055" d="
                m14 4c-1.1 0-2.2157 0.92136-2 2v5h1v-5c0-0.4714 0.5286-1 1-1h9v-1zm11 0v1h9c0.4714
                0 1.0924 0.53775 1 1v5h1v-5c0-1.1-0.9-2-2-2zm2.5 4c-0.83 0-1.5 0.67-1.5 1.5s0.67
                1.5 1.5 1.5 1.5-0.67 1.5-1.5-0.67-1.5-1.5-1.5zm-6.5 2-5 6h16l-4-4-3.0293 2.7109zm-9
                3v5c0 1.1 0.9 2 2 2h9v-1h-9c-0.4714 0-1.0924-0.53775-1-1v-5zm23 0v5c0 0.4714-0.5286
                1-1 1h-9v1h9c1.1 0 2-0.9 2-2v-5z
            "/>
        </svg>
        `],
        {type: 'image/svg+xml'},
    ),
)



@Component({})
export default class extends Vue {

    @Prop({type: Section, required: true}) declare readonly page:Section<ContentPage>
    @Prop({type: Array, required: true}) declare readonly suggestions:Blob[]

    mounted(){
        this.autogrow_all()
    }

    get button(){
        return this.page.content.button
    }
    set button(value){
        this.page.content.button = value
        this.save()
    }

    get headline(){
        return this.page.content.headline
    }
    set headline(value){
        this.page.content.headline = value.replace('\n', '')
        this.save()
    }

    get desc(){
        return this.page.content.desc
    }
    set desc(value){
        this.page.content.desc = value.replace('\n', '')
        this.save()
    }

    textarea_input(event:Event){
        // Autogrow upon textarea input
        this.autogrow(event.target as HTMLTextAreaElement)
    }

    autogrow(textarea:HTMLTextAreaElement){
        // Autogrow textarea
        textarea.style.height = '1px'  // Reset height otherwise scrollHeight won't ever reduce
        textarea.style.height = `${textarea.scrollHeight}px`
        // Must also grow width if button style
        if (this.button){
            textarea.style.width = '1px'
            textarea.style.width = `${textarea.scrollWidth}px`
        } else {
            textarea.style.width = 'auto'
        }
    }

    autogrow_all(){
        // Autogrow all textareas
        for (const textarea of this.$el.querySelectorAll('textarea')){
            this.autogrow(textarea)
        }
    }

    async change_image():Promise<void>{
        // Change pagebait image
        const blob = await this.$store.dispatch('show_dialog', {
            component: DialogImageChooser,
            props: {
                // Same limits as image section in case used for an image section too in future
                width: SECTION_IMAGE_WIDTH * 2,
                height: SECTION_IMAGE_WIDTH * 2,
                suggestions: this.suggestions,
                removeable: !!this.page.content.image,
            },
        }) as Blob
        if (blob !== undefined){  // may be null
            this.page.content.image = blob
            this.save()
        }
    }

    save(){
        // Save changes to db
        void self.app_db.sections.set(this.page)
    }

    @Watch('button') watch_button(){
        // Changing pagebait style affects dimensions of textareas
        this.$nextTick(() => {
            this.autogrow_all()
        })
    }

    @Watch('page.content.image', {immediate: true}) watch_image(){
        // Once div available in DOM, apply bg image (done via JS due to CSP)
        const url =
            this.page.content.image ? URL.createObjectURL(this.page.content.image) : PLACEHOLDER
        void this.$nextTick(() => {
            const div = this.$refs['image'] as HTMLDivElement
            div.style.backgroundImage = `url(${url})`
        })
    }

}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.pagebait-editable
    // Fix colors so not affected by displayer dark mode
    @include themed(background-color, #ddd, #222)  // Slightly diff to content bg for contrast
    @include themed(color, black, white)

    padding: 12px
    text-align: center

.pagebait
    cursor: default !important
    max-width: $stello_content_width - 2px * 4  // Padding and border
    margin: 0 auto

    .image
        cursor: pointer

    textarea
        resize: none


::v-deep .v-input.v-input--switch .v-input--selection-controls__input div:not([aria-disabled])
    // Make switch look active whether true or false
    // NOTE Overly specific to override existing style
    color: var(--primary) !important


</style>
