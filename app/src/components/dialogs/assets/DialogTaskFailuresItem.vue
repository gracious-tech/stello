
<template lang='pug'>

v-card.card
    v-card-title {{ task.label }}
    v-card-subtitle(class='app-fg-error-relative') {{ reason }}
    v-card-text(class='text-body-1')
        p {{ explanation }}
    v-card-actions
        app-btn(v-if='support_url' :href='support_url') Let us know
        app-btn(@click='fix') {{ fix_text }}

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import {Task, TaskStartArgs, TaskErrorType} from '@/services/tasks/tasks'
import {OauthUseless, oauth_pretask_reauth, ScopeSet, scope_set_for_task}
    from '@/services/tasks/oauth'
import {OAuth} from '@/services/database/oauths'


@Component({})
export default class extends Vue {

    @Prop() task:Task

    oauth:OAuth = null

    async created(){
        // If task refers to an oauth, get fresh copy of it
        if (this.task.fix_oauth){
            this.oauth = await self.app_db.oauths.get(this.task.fix_oauth)
        }
    }

    get required_scope_set():ScopeSet{
        // Detect required scope set of task (if any)
        return scope_set_for_task(this.task.name)
    }

    get error_type():TaskErrorType|'oauth_access'|'oauth_scopes'|'oauth_useless'{
        // Expand on task error types with more specific oauth ones
        const type = this.task.error_type!
        if (type === 'auth' && this.task.fix_oauth){
            // Since have access to oauth object, can be more specific
            if (this.oauth?.scope_sets.includes(this.required_scope_set)){
                return 'oauth_access'
            }
            return 'oauth_scopes'
        }
        if (this.task.error instanceof OauthUseless){
            return 'oauth_useless'
        }
        return type
    }

    get reason():string{
        // Display the general reason for the failure
        return {
            network: "Could not connect",
            auth: "Wrong password",
            oauth_access: "Not signed in",
            oauth_scopes: "Do not have permission",
            oauth_useless: `Account not valid (${this.oauth?.email})`,
            settings: "Incorrect settings",
            throttled: "Limit exceeded",
            unknown: "Unexpected error",
        }[this.error_type]
    }

    get explanation():string{
        // Get an explanation suitable for the fail type

        // User-friendly description of scopes
        const scopes_ui = {
            contacts: "Read contacts and save changes to them",
            email_send: "Send emails",
        }

        if (this.error_type === 'network'){
            return "There seems to be a problem with your Internet connection."
        } else if (this.error_type === 'auth'){
            return "The username and/or password given was not accepted."
        } else if (this.error_type === 'oauth_access'){
            return "Stello is not signed in to your account (session may have expired)."
        } else if (this.error_type === 'oauth_scopes'){
            return `Permission required: ${scopes_ui[this.required_scope_set]}`
        } else if (this.error_type === 'oauth_useless'){
            return `The chosen account is not able to "${scopes_ui[this.required_scope_set]}"
                and is likely just for signing in. You'll need to select a different account or
                change your settings.`
        } else if (this.error_type === 'settings'){
            return "The settings currently in use don't seem to be working."
        } else if (this.error_type === 'throttled'){
            return `You've exceeded a limit for your account and must wait a moment before retrying.
                This is a limit set by your connected account, not by Stello.
                You may find you can retry within minutes, hours, or at worst a day.
                `
        }
        return "Something has gone wrong. Let us know so we can prevent it from happening again."
    }

    get fix_text():string{
        // Get text for the fix button
        // NOTE This needs to match logic of `fix()`
        if (this.error_type === 'oauth_access'){
            return "Sign in"
        } else if (this.error_type === 'oauth_scopes'){
            return "Give permission"
        } else if (this.error_type === 'oauth_useless'){
            return "Change account"
        } else if (this.error_type === 'auth' && this.task.fix_auth){
            return "Change password"
        } else if (this.error_type === 'settings' && this.task.fix_settings){
            return "Change settings"
        }
        return "Retry"
    }

    get support_url():string|undefined{
        // Generate a support url if the fail type is unknown
        // SECURITY Don't include task params or label as may include personal data
        if (this.error_type === 'unknown'){
            const desc = "I was trying to...\n\nBut...\n\n\n----------TECHNICAL DETAILS----------\n"
                + `Task: ${this.task.name}\nError report: ${this.task.error_report_id}`
            return `https://gracious.tech/support/stello/error/?desc=${encodeURIComponent(desc)}`
        }
        return undefined
    }

    async fix():Promise<void>{
        // Attempt to fix the problem
        const task_args:TaskStartArgs = [this.task.name, this.task.params, this.task.options]
        let abort_msg:void|string
        if (this.error_type === 'oauth_useless' && this.task.fix_settings){
            abort_msg = await this.task.fix_settings()
        } else if (this.error_type.startsWith('oauth_')){
            // Need new credentials for same scopes as before
            oauth_pretask_reauth(task_args, this.oauth)
        } else if (this.error_type === 'auth' && this.task.fix_auth){
            abort_msg = await this.task.fix_auth()
        } else if (this.error_type === 'settings' && this.task.fix_settings){
            abort_msg = await this.task.fix_settings()
        } else {
            // Only other thing to do is simply retry...
            void this.$tm.start(...task_args)
        }

        // If fix returned an abort message, abort task
        if (abort_msg){
            this.$tm.abort_failed(this.task, abort_msg)
        }
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/globals.sass'


.card  // Don't use .v-card as applies to whole dialog
    @include themed(background-color, #ddd, #333)

    .v-card__title
        font-size: 16px

    .v-card__subtitle
        font-size: 18px


</style>
