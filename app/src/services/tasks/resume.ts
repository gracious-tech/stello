
import {differenceInHours} from 'date-fns'

import {task_manager} from './tasks'
import {setIntervalPlus} from '../utils/async'


export async function resume_tasks():Promise<void>{
    // Start or resume tasks that are due to be completed and schedule repeats
    // WARN Should only run once on startup

    // Upload configs if they failed to update earlier
    for (const profile of await self._db.profiles.list()){
        if (profile.configs_need_uploading){
            task_manager.start_configs_update(profile.id)
        }
    }

    // Send messages if failed earlier
    // TODO Detect messages that haven't completely sent yet

    // Check for new responses now and routinely
    setIntervalPlus(15, 'm', true, () => {
        task_manager.start_responses_receive()
    })

    // See if contacts need syncing and schedule regular checks
    setIntervalPlus(2, 'h', true, async () => {  // Checks every 2 hours but only syncs every 12
        const now = new Date()
        for (const oauth of await self._db.oauths.list()){
            const last = oauth.contacts_sync_last
            if (oauth.contacts_sync && (!last || differenceInHours(now, last) >= 12)){
                task_manager.start_contacts_sync(oauth.id)
            }
        }
    })
}
