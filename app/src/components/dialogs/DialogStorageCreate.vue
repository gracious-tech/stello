
<template lang='pug'>

v-card
    v-card-title Create new storage

    v-card-text
        app-text(v-model.trim='bucket' label="Storage container name" :loading='loading'
            :messages='message' :error='error')

        app-select(v-model='region' :items='regions' label="Region"
            hint="Choose somewhere close to where your recipients are (not where you are)")

    v-card-actions
        app-btn(@click='dismiss') Cancel
        app-btn(@click='setup' :disabled='!bucket_available || !region') Setup

</template>


<script lang='ts'>

import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import {debounce_method} from '@/services/misc'
import {HostManager} from '@/services/hosts/types'
import {validate_subdomain} from '@/services/hosts/common'


@Component({})
export default class extends Vue {

    @Prop() manager:HostManager

    bucket = ''
    bucket_dirty = false
    bucket_available:boolean = null
    region:string = null
    regions:{value:string, text:string}[] = []

    created(){
        // Fetch the regions
        this.manager.list_regions().then(regions => {
            this.regions = regions.map(region => {
                const obj = {value: region, text: region}
                // Fetch region's name, and when done update the item's text
                this.manager.get_region_name(region).then(name => {
                    obj.text = name
                })
                return obj
            })
        })
    }

    get error(){
        // Whether bucket name is invalid or already taken
        // NOTE Vuetify requires this to return a boolean
        return this.bucket_dirty && (!!this.error_msg || this.bucket_available === false)
    }

    get loading(){
        // Whether still checking if name available
        return this.bucket_dirty && !this.error_msg && this.bucket_available === null
    }

    get error_msg():string{
        // An error string if bucket name invalid
        return validate_subdomain(this.bucket, 3)
    }

    get message(){
        // The message to display under the name field (whether an error or other)
        if (!this.bucket_dirty)
            return ''
        if (this.error_msg)
            return this.error_msg
        if (this.bucket_available === null)
            return "Checking availability..."
        return this.bucket_available ? "Name available" : "Name taken"
    }

    @Watch('bucket') watch_bucket(){
        // Check if name available each time it is changed
        this.bucket_dirty = true
        this.bucket_available = null
        if (!this.error_msg){  // TODO Sometimes old value here?
            this.check_availability()
        }
    }

    @debounce_method() async check_availability(){
        // Check if bucket name is available

        // Since user has stopped typing, convert their input to lowercase
        this.bucket = this.bucket.toLowerCase()

        const bucket_requested = this.bucket
        const available = await this.manager.bucket_available(bucket_requested)
        if (this.bucket === bucket_requested){
            // Bucket hasn't changed while processing, so update
            this.bucket_available = available
        }
    }

    dismiss(){
        this.$emit('close')
    }

    setup(){
        // Accept the name and setup services
        this.$emit('close', {bucket: this.bucket, region: this.region})
    }

}

</script>


<style lang='sass' scoped>

</style>
