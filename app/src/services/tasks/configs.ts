
import {Task} from './tasks'
import {object_to_blob, buffer_to_url64} from '../utils/coding'
import {export_key} from '../utils/crypt'


export async function configs_update(task:Task){
    // Update config files in host

    // Get profile from params
    const [profile_id] = task.params
    let profile = await self._db.profiles.get(profile_id)

    // Setup task
    task.label = `Applying new settings for ${profile.display}`

    // Extract response public key
    const resp_key_public = buffer_to_url64(await export_key(profile.host_state.resp_key.publicKey))

    // Upload displayer config
    const storage = profile.new_host_user()
    const disp_config_name = `disp_config_${profile.host_state.disp_config_name}`
    const upload_displayer = storage.upload_file(disp_config_name, object_to_blob({
        notify_include_contents: profile.options.notify_include_contents,
        allow_replies: profile.options.allow_replies,
        allow_reactions: profile.options.allow_reactions,
        allow_delete: profile.options.allow_delete,
        allow_resend_requests: profile.options.allow_resend_requests,
        social_referral_ban: profile.options.social_referral_ban,
        resp_key_public,
        reaction_options: profile.options.reaction_options,
    }))

    // Upload responder config
    const upload_responder = storage.upload_responder_config({
        notify_mode: profile.options.notify_mode,
        notify_include_contents: profile.options.notify_include_contents,
        allow_replies: profile.options.allow_replies,
        allow_reactions: profile.options.allow_reactions,
        allow_delete: profile.options.allow_delete,
        allow_resend_requests: profile.options.allow_resend_requests,
        resp_key_public,
        email: profile.email,
    })

    // Wait till both uploads complete
    await task.add(upload_displayer, upload_responder)

    // Update profile state
    // WARN Get fresh profile data in case changed while tasks were completing
    profile = await self._db.profiles.get(profile.id)
    profile.host_state.displayer_config_uploaded = true
    profile.host_state.responder_config_uploaded = true
    await self._db.profiles.set(profile)
}
