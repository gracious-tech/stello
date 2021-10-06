
import app_config from '@/app_config.json'
import {Task} from './tasks'
import {buffer_to_url64} from '../utils/coding'
import {export_key} from '../utils/crypt'


export async function configs_update(task:Task){
    // Update config files in host

    // Get profile from params
    const [profile_id] = task.params as [string]
    let profile = await self.app_db.profiles.get(profile_id)
    if (!profile){
        throw task.abort("Sending account no longer exists")
    }

    // Setup task
    task.label = `Applying new settings for ${profile.display}`

    // Done if nothing to do
    if (!profile.configs_need_uploading){
        return
    }

    // Prep for upload tasks
    const storage = await self.app_db.new_host_user(profile)
    const resp_key_public = buffer_to_url64(
        await export_key(profile.host_state.resp_key.publicKey!))
    let upload_displayer = Promise.resolve()
    let upload_responder = Promise.resolve()

    // Upload displayer config
    if (!profile.host_state.displayer_config_uploaded){
        upload_displayer = storage.upload_displayer_config({
            version: app_config.version,  // Did not exist v0.7.2 and below
            responder: `${profile.api}responder/`,
            notify_include_contents: profile.options.notify_include_contents,
            allow_replies: profile.options.allow_replies,
            allow_reactions: profile.options.allow_reactions,
            allow_delete: profile.options.allow_delete,
            allow_resend_requests: profile.options.allow_resend_requests,
            social_referral_ban: profile.options.social_referral_ban,
            resp_key_public,
            reaction_options: profile.options.reaction_options,
        })
    }

    // Upload responder config
    if (!profile.host_state.responder_config_uploaded){
        upload_responder = storage.upload_responder_config({
            version: app_config.version,  // Did not exist v0.7.2 and below
            notify_mode: profile.options.notify_mode,
            notify_include_contents: profile.options.notify_include_contents,
            allow_replies: profile.options.allow_replies,
            allow_reactions: profile.options.allow_reactions,
            allow_delete: profile.options.allow_delete,
            allow_resend_requests: profile.options.allow_resend_requests,
            resp_key_public,
            email: profile.email,
        })
    }

    // Wait till both uploads complete
    await task.add(upload_displayer, upload_responder)

    // Update profile state
    // WARN Get fresh profile data in case changed while tasks were completing
    profile = await self.app_db.profiles.get(profile.id)
    profile!.host_state.displayer_config_uploaded = true
    profile!.host_state.responder_config_uploaded = true
    await self.app_db.profiles.set(profile!)
}
