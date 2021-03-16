
<template lang='pug'>

v-card
    v-card-title Create new profile in AWS

    v-card-text
        v-text-field(v-model.trim='bucket' label="Storage container name" :loading='loading'
            :messages='message' :error='error' color='accent')

        v-select(v-model='region' :items='regions' label="Region" persistent-hint
            hint="Choose somewhere close to where your recipients are (not where you are)")

    v-card-actions
        app-btn(@click='dismiss') Cancel
        app-btn(@click='setup' :disabled='!bucket_available') Setup

</template>


<script lang='ts'>

import {Component, Vue, Watch} from 'vue-property-decorator'

import {debounce_method} from '@/services/misc'
import {HostManagerAws} from '@/services/hosts/aws_manager'


@Component({})
export default class extends Vue {

    manager:HostManagerAws
    bucket = ''
    bucket_dirty = false
    bucket_available = null
    region = 'us-west-2'  // A default low cost region
    regions = ['us-west-2']

    created(){
        // Create a manager instance and use to get available regions
        this.manager = new HostManagerAws({
            key_id: this.$store.state.manager_aws_key_id,
            key_secret: this.$store.state.manager_aws_key_secret,
        })
        this.manager.list_regions().then(regions => {
            this.regions = regions
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

    get error_msg(){
        // An error string if bucket name invalid
        if (this.bucket.length < 3 || this.bucket.length > 63)
            return "Name must be between 3 to 63 characters long"
        if (this.bucket[0] === '-' || this.bucket.slice(-1) === '-')
            return "Name cannot begin or end with a hyphen"
        if (! /^[A-Za-z0-9\-]+$/.test(this.bucket))
            return "Name can only contain letters, numbers, and hyphens"
        return null
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
