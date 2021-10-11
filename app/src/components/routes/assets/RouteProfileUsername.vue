
<template lang='pug'>

app-text(
    v-model='username_raw'
    :loading='!!username_checking'
    :error-messages='username_error'
    persistent-placeholder
    label="Message links"
    placeholder='username'
    hint="Can be in any language (may include hyphens)"
    prefix='https://'
    :suffix='suffix'
)


</template>


<script lang='ts'>

import {Component, Vue, Watch, Prop} from 'vue-property-decorator'

import * as punycode from 'punycode/'

import {debounce_method} from '@/services/misc'
import {username_available} from '@/services/hosts/gracious_user'


// Define alphabet for safe case conversion
const ascii_lower = 'abcdefghijklmnopqrstuvwxyz'
const ascii_upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'


@Component({})
export default class extends Vue {

    @Prop({required: true}) generic_domain!:boolean

    username_raw = ''
    username_checking:string|null = null  // The last username that a check was initiated for
    username_checked:string|null = null  // The last username that a check was completed for
    username_checked_available:boolean|null = null  // Whether username available (null for error)

    get suffix(){
        // The part of the URL after the username
        return this.generic_domain ? `.${import.meta.env.VITE_HOSTED_DOMAIN_GENERIC}/...`
            : `.${import.meta.env.VITE_HOSTED_DOMAIN_BRANDED}/...`
    }

    get username_visual(){
        // Username as it will appear visually in browsers (unicode & lowercase english)
        // NOTE Not using regular toLowerCase as might affect other languages (only a-z needs lower)
        return this.username_raw.trim().split('').map(c => {
            const index = ascii_upper.indexOf(c)
            return index === -1 ? c : ascii_lower[index]
        }).join('')
    }

    get username_punycode(){
        // Get username encoded in punycode
        return punycode.toASCII(this.username_raw.trim()).toLowerCase()
    }

    get username_invalid():string|null{
        // Whether username has invalid chars
        // NOTE Since encoded to punycode, can't be exact with lengths
        if (this.username_punycode.length < 2){
            return "Username is too short"
        } else if (this.username_punycode.length > 60){
            return "Username is too long"
        } else if (this.username_punycode.includes(' ')){
            return "Username cannot include spaces"
        } else if (this.username_punycode[0] === '-' || this.username_punycode.at(-1) === '-'){
            return "Username cannot start or end with a hyphen"
        }
        const invalid = /[^a-z0-9-]/.exec(this.username_punycode)
        if (invalid){
            return `Username cannot contain: ${invalid[0]!}`
        }
        return null
    }

    get username_error():string|null{
        // Error with username, if any
        if (!this.username_raw){
            return null
        } else if (this.username_invalid){
            return this.username_invalid
        } else if (this.username_checking){
            return null
        } else if (this.username_punycode === this.username_checked &&
                !this.username_checked_available){
            return this.username_checked_available === null ? "Couldn't connect" : "Not available"
        }
        return null
    }

    @Watch('username_punycode') watch_username_punycode():void{
        // Clear report of available username as now changing it
        this.$emit('available', null)
        // Check username is available whenever it changes
        if (!this.username_invalid){
            void this.check_availability(this.username_punycode)
        }
    }

    @debounce_method() async check_availability(value:string){
        // Check if username is available
        this.username_checking = value
        let success:boolean|null = false
        try {
            const result = await username_available(value)
            success = result.valid && result.available
        } catch (error){
            console.error(error)
            success = null
        }
        // Only process if username hasn't changed in the meantime (and sent another request)
        if (this.username_checking === value){
            this.username_checking = null
            this.username_checked = value
            this.username_checked_available = success
            if (success){
                this.$emit('available', value)
            }
        }
    }
}

</script>


<style lang='sass' scoped>


</style>
