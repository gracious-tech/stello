
import {Task} from './tasks'
import {concurrent} from '../utils/async'


export async function retract_message(task:Task):Promise<void>{
    // Task for revoking a sent message's copies and assets, and optionally also deleting afterwards

    // Unpack task params
    const [msg_id] = task.params as [string]
    const [remove] = task.options as [boolean]
    let msg = await self.app_db.messages.get(msg_id)
    if (!msg){
        throw task.abort("Message no longer exists")
    }
    task.label = `${remove ? "Deleting" : "Retracting"} message "${msg.draft.title}"`

    // Get access to storage
    const profile = await self.app_db.profiles.get(msg.draft.profile)
    if (!profile){
        throw task.abort("Sending account no longer exists")
    }
    const storage = await self.app_db.new_host_user(profile)

    // Delete copies
    const copies = await self.app_db.copies.list_for_msg(msg_id)
    task.upcoming(copies.length)
    await concurrent(copies.map(copy => {
        return async () => {
            await storage.delete_file(`copies/${copy.id}`)
            await storage.delete_file(`invite_images/${copy.id}`)
            copy.expired = true
            await task.expected(self.app_db.copies.set(copy))
        }
    }))

    // List message assets
    // NOTE While could get assets list from database, checking with server is more foolproof
    const assets = await storage.list_files(`assets/${msg_id}/`)
    task.upcoming(assets.length)
    await concurrent(assets.map(asset => {
        return async () => task.expected(storage.delete_file(asset))
    }))

    // Either delete or update message's expired property
    if (remove){
        await self.app_db.messages.remove(msg.id)
    } else {
        // WARN Always get fresh copy of objects from db after async stuff (could have been deleted)
        msg = await self.app_db.messages.get(msg_id)
        if (msg && !msg.expired){
            msg.expired = true
            await self.app_db.messages.set(msg)
        }
    }
}
