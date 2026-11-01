
import app_config from '@/app_config.json'
import {DisplayerConfig, SubscribeFormConfig} from '@/shared/shared_types'
import {buffer_to_url64, string_to_utf8, url64_to_buffer} from '@/services/utils/coding'
import {export_key, encrypt_sym, import_key_sym} from '@/services/utils/crypt'
import {Task} from './tasks'
import type {Profile} from '@/services/database/profiles'


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

    // Generate configs that need uploading
    // NOTE Plain json kept so can later detect if settings changed while uploading
    const storage = await self.app_db.new_host_user(profile)
    const uploading = await gen_configs(profile)
    const uploads:Promise<unknown>[] = []

    // Upload displayer config
    if (!profile.host_state.displayer_config_uploaded){
        uploads.push(encrypt_sym(
            string_to_utf8(uploading.displayer),
            profile.host_state.shared_secret,
        ).then(encrypted => storage.upload_displayer_config(encrypted)))
    }

    // Upload subscribe forms config
    if (!profile.host_state.subscribe_config_uploaded){
        // Upload the config as an array of encrypted json for each form
        const forms = JSON.parse(uploading.subscribe) as SubscribeFormConfig[]
        uploads.push(Promise.all(forms.map(async config => {
            // Generate the secret from the actual id and encrypt the config data
            const secret = await import_key_sym(url64_to_buffer(config.id), false, ['encrypt'])
            const encrypted = await encrypt_sym(string_to_utf8(JSON.stringify(config)), secret)
            return buffer_to_url64(encrypted)
        })).then(strings => storage.upload_subscribe_config(JSON.stringify(strings))))
    }

    // Upload responder config
    if (!profile.host_state.responder_config_uploaded){
        uploads.push(encrypt_sym(
            string_to_utf8(uploading.responder),
            profile.host_state.shared_secret,
        ).then(async encrypted => {
            await storage.upload_responder_config(encrypted)
            // Also update email with host (may not have changed, but should be quick anyway)
            const host_user = await self.app_db.new_host_user(profile!)
            await host_user.update_email(profile!.email)
        }))
    }

    // Wait till promises complete
    await task.add(...uploads)

    // Update profile state
    // WARN Get fresh profile data in case changed while tasks were completing
    // NOTE Only mark configs this run uploaded, and only if settings didn't change meanwhile
    //      (otherwise leave as needing upload so the change isn't lost)
    const uploaded = {
        displayer: !profile.host_state.displayer_config_uploaded,
        subscribe: !profile.host_state.subscribe_config_uploaded,
        responder: !profile.host_state.responder_config_uploaded,
    }
    profile = await self.app_db.profiles.get(profile.id)
    if (!profile){
        return  // Profile deleted while uploading
    }
    const current = await gen_configs(profile)
    if (uploaded.displayer && current.displayer === uploading.displayer){
        profile.host_state.displayer_config_uploaded = true
    }
    if (uploaded.subscribe && current.subscribe === uploading.subscribe){
        profile.host_state.subscribe_config_uploaded = true
    }
    if (uploaded.responder && current.responder === uploading.responder){
        profile.host_state.responder_config_uploaded = true
    }
    await self.app_db.profiles.set(profile)
}


async function gen_configs(profile:Profile):Promise<Record<'displayer'|'subscribe'|'responder',
        string>>{
    // Generate plain json of every config for a profile (before encryption)

    // Get subscribe_forms and other shared values
    const forms = await self.app_db.subscribe_forms.list_for_profile(profile.id)
    const resp_key_public = buffer_to_url64(
        await export_key(profile.host_state.resp_key.publicKey))

    // Displayer config
    const displayer:DisplayerConfig = {
        version: app_config.version,  // Did not exist v0.7.2 and below
        responder: `${profile.api}responder/`,
        notify_include_contents: profile.options.notify_include_contents,
        allow_replies: profile.options.allow_replies,
        allow_comments: profile.options.allow_comments,
        allow_reactions: profile.options.allow_reactions,
        allow_delete: profile.options.allow_delete,
        allow_resend_requests: profile.options.allow_resend_requests,
        social_referral_ban: profile.options.social_referral_ban,
        resp_key_public,
        reaction_options: profile.options.reaction_options,
        theme_style: profile.options.theme_style,
        theme_color: profile.options.theme_color,
    }

    // Subscribe forms config
    // NOTE config_secret is embedded within forms config so it doesn't need passing in a URL
    const config_secret_url64 =
        buffer_to_url64(await export_key(profile.host_state.shared_secret))
    const subscribe:SubscribeFormConfig[] = forms.map(form => ({
        id: form.id,
        text: form.text,
        accept_message: form.accept_message,
        config_secret_url64,
    }))

    // Responder config
    const responder = {
        version: app_config.version,  // Did not exist v0.7.2 and below
        notify_mode: profile.options.notify_mode,
        notify_include_contents: profile.options.notify_include_contents,
        // NOTE Responder does not distinguish between allow_replies and allow_comments
        allow_replies: profile.options.allow_replies || profile.options.allow_comments,
        allow_reactions: profile.options.allow_reactions,
        allow_delete: profile.options.allow_delete,
        allow_resend_requests: profile.options.allow_resend_requests,
        resp_key_public,
        email: profile.email,
        subscribe_forms: forms.map(form => form.id),  // Added in v1.5.0
    }

    return {
        displayer: JSON.stringify(displayer),
        subscribe: JSON.stringify(subscribe),
        responder: JSON.stringify(responder),
    }
}
