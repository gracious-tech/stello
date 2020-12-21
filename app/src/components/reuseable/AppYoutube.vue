
<template lang='pug'>

iframe(:src='src' allow='autoplay; encrypted-media; gyroscope; accelerometer')

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import app_config from '@/app_config.json'


@Component({})
export default class extends Vue {

    @Prop() video_id
    // NOTE type/default required so argless prop works (https://git.io/JfsWs)
    @Prop({type: Boolean, default: false}) hide_controls

    get src(){
        // Get the src for the iframe
        const params = new URLSearchParams([
            ['controls', this.hide_controls ? '0' : '1'],  // Whether to show controls within iframe
            ['disablekb', this.hide_controls ? '1' : '0'],  // Whether to disable keyboard control
            ['modestbranding', '1'],  // Doesn't actually do anything when controls=0 but may later
            ['iv_load_policy', '3'],  // Do not show video annotations by default
            ['rel', '0'],  // Only show related videos from same channel (can't disable completely)
            ['playsinline', '1'],  // Stop iOS from playing videos fullscreen by default
        ])
        if (process.env.NODE_ENV === 'production'){
            // Protect against malicious control of video (from other iframe's?)
            params.append('origin', `https://${self.document.domain}`)
        }
        return `https://www.youtube-nocookie.com/embed/${this.video_id}?${params}`
    }

}

</script>


<style lang='sass' scoped>


</style>
