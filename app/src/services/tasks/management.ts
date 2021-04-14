
import {Task} from './tasks'
import {concurrent} from '../utils/async'


export async function retract_message(task:Task):Promise<void>{
    // Task for revoking a sent message's copies and assets

    // Unpack task params
    const [msg_id] = task.params as [string]
    const msg = await self._db.messages.get(msg_id)
    task.label = `Retracting message "${msg.draft.title}"`

    // Get access to storage
    const profile = await self._db.profiles.get(msg.draft.profile)
    const storage = profile.new_host_user()

    // Delete copies
    const copies = await self._db.copies.list_for_msg(msg_id)
    task.upcoming(copies.length)
    await concurrent(copies.map(copy => {
        return async () => {
            await storage.delete_file(`copies/${copy.id}`)
            copy.expired = true
            await task.expected(self._db.copies.set(copy))
        }
    }))

    // List message assets
    // NOTE While could get assets list from database, checking with server is more foolproof
    const assets = await storage.list_files(`assets/${msg_id}/`)
    task.upcoming(assets.length)
    await concurrent(assets.map(asset => {
        return async () => task.expected(storage.delete_file(asset))
    }))

    // Update message's expired property
    msg.expired = true
    await self._db.messages.set(msg)
}
