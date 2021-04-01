
import {Task} from './tasks'


export async function email_oauth_setup(task:Task):Promise<void>{
    // Setup oauth for email sending for given profile
    // NOTE Doesn't validate whether have correct scopes as can fix later if a send task fails
    const [oauth_id, profile_id] = task.params
    const oauth = await self._db.oauths.get(oauth_id)
    const profile = await self._db.profiles.get(profile_id)

    // Still set task label as will show briefly that task has been completed
    task.label = `Use ${oauth.email} to send emails`

    // Update email if needed
    // TODO Consider verifying with user if they intended this, as very easy to select wrong account
    if (profile.email !== oauth.email){
        profile.email = oauth.email
        profile.host_state.responder_config_uploaded = false
        // TODO Consider running upload configs as a post task, if email change
    }

    // Replace whole smtp object in case old settings exist
    profile.smtp = {
        oauth: oauth_id,
        user: '',
        pass: '',
        host: '',
        port: null,
        starttls: false,
    }

    // Save changes
    await self._db.profiles.set(profile)
}
