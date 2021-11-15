
<template lang='pug'>

a(@click='click' class='noselect')
    template(v-if='clicks === 0') Are you #[em really] “free”?
    template(v-else-if='clicks === 1') Are you going to show me ads?
    template(v-else-if='clicks === 2') Are you tracking me?
    template(v-else-if='clicks === 3') Are you tracking my readers?
    template(v-else-if='clicks === 4') What's the catch?
    template(v-else-if='clicks === 5') How are you funded?
    template(v-else) I'd like to help!

</template>


<script lang='ts'>

import {Component, Vue} from 'vue-property-decorator'


@Component({})
export default class extends Vue {

    clicks = 0

    get really_free_response(){
        if (this.clicks === 0)
            return "Yes, I'm really free (as in “your sins are forgiven” kind of free...)"
        if (this.clicks === 1)
            return "No, can't stand the things..."
        if (this.clicks === 2)
            return "No, and you can check too as my source code is public"
        if (this.clicks === 3)
            return "Nop, don't want to know about them either"
        if (this.clicks === 4)
            return "Um... don't use me to plot evil, I guess?"
        if (this.clicks === 5)
            return `People like yourself fund me and other Christian apps,
                so we can all use them for free, yay!`
        return "Thanks, that would be great!"
    }

    click(){
        void this.$store.dispatch('show_snackbar', this.really_free_response)
        if (this.clicks > 5){
            setTimeout(() => {
                self.open('https://give.gracious.tech/', '_blank')
            }, 3000)
        }
        setTimeout(() => {
            this.clicks += 1
        }, 1000)
    }
}

</script>


<style lang='sass' scoped>


a
    font-size: 12px
    &:not(:hover)
        opacity: 0.3
        color: inherit !important


</style>
