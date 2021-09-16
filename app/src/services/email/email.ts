
import {Profile} from '../database/profiles'
import {TaskAborted} from '../tasks/tasks'
import {generate_token} from '../utils/crypt'
import {Email, EmailSettings} from '../native/types'
import {MustReconfigure, MustWait} from '../utils/exceptions'
import {send_batch_smtp} from './smtp'
import {BadEmailAddress} from './utils'
import {send_batch_microsoft} from './microsoft'
import {send_batch_google} from './google'


export interface EmailTask {
    send:(email:Email)=>Promise<boolean>
    abort:()=>void
}


// Preserve instances of email accounts so throttling is account-wide, not per task
const ACCOUNT_MANAGERS:Record<string, EmailAccountManager> = {}


function transport_id_from_settings(settings:Profile['smtp_settings']):string{
    // Generate transport id from settings
    return JSON.stringify([settings.oauth, settings.host, settings.port, settings.starttls,
        settings.user, settings.pass])
}


export function new_email_task(settings:Profile['smtp_settings']){
    // Start a new email task for sending emails associated with one another

    // Use single manager for single host-user so throttling is cross-task per account
    // NOTE id made up of all settings so that if any change, the change will take effect
    // NOTE This means that can potentially have multiple instances for single user
    //      but in that case only one of them is likely to actually work anyway
    const transport_id = transport_id_from_settings(settings)

    // Init a new manager if it doesn't exist or is dead
    let manager = ACCOUNT_MANAGERS[transport_id]
    if (!manager || manager.dead){
        manager = ACCOUNT_MANAGERS[transport_id] = new EmailAccountManager(settings)
    }

    // Give the task a new id so that any abort only happens to emails belonging to this task
    const task_id = generate_token()

    // Provide access to send and abort methods
    return {
        send: (email:Email) => manager!.send(task_id, email),
        abort: () => manager!.abort(task_id),
    }
}


export interface QueueItem {
    email:Email
    task_id:string
    resolve:(success:boolean)=>void
    reject:(reason:unknown)=>void
}


class EmailAccountManager {

    settings:Profile['smtp_settings']
    queue:QueueItem[] = []
    processors = new Set<string>()
    max_processors = 5  // NOTE SMTP currently configured to provide 10 connections, used as needed
    max_batch_size = 1  // Not currently used as only Microsoft implemented, and rate limited anyway
    last_send = 0  // Epoch time
    interval = 0  // ms
    dead = false  // Prevents instance from being used by throwing when try to send
    aborted = new Set<string>()

    constructor(settings:Profile['smtp_settings']){
        this.settings = settings
    }

    async send(task_id:string, email:Email):Promise<boolean>{
        // Schedule sending of given email and resolve with success boolean when done
        // NOTE Will throw error for anything other than a problem with recipient's address

        // Prevent queuing of any more emails if transport is declared dead
        // WARN Otherwise could end up in situation where promise is never resolved
        if (this.dead){
            throw new Error("Email transport is dead but was still given an email to send")
        } else if (this.aborted.has(task_id)){
            // Task has been aborted so prevent further queuing
            throw new TaskAborted()
        }

        // Return promise that's resolved when email is actually sent (not just queued)
        return new Promise((resolve, reject) => {
            this.queue.push({resolve, reject, email, task_id})
            // Add a processor if within limit
            if (this.processors.size < this.max_processors){
                this.processors.add(email.id)
                void this.process(email.id)  // Borrow email id for use as processor id since unique
            }
        })
    }

    abort(task_id:string){
        // Add task_id to aborted list, so no more items are queued (e.g. after throttling)
        this.aborted.add(task_id)
        // Remove all emails from queue that belong to given task and reject them
        for (let i=this.queue.length-1; i >= 0; i--){
            if (this.queue[i]!.task_id === task_id){
                const [removed] = this.queue.splice(i, 1)
                removed!.reject(new TaskAborted())
            }
        }
    }

    private async process(processor:string):Promise<void>{
        // Check queue and send any items (if not throttled)

        // If no items in queue or over limit, kill self
        if (!this.queue.length || this.processors.size > this.max_processors){
            this.processors.delete(processor)
            return
        }

        // Preserve whether this item was subject to an interval so can consult when finishes
        const subject_to_interval = !!this.interval

        // If throttled, wait until interval expires before continuing processing
        if (this.interval){
            const now = this.now()
            const time_till_can_send = (this.last_send + this.interval) - now
            if (time_till_can_send > 0){
                // Can't send yet, so check again after interval over
                const buffer = 10  // Avoid chance of being off by a few ms
                setTimeout(() => {void this.process(processor)}, time_till_can_send + buffer)
                console.debug(`Sending waiting ${time_till_can_send + buffer}ms due to interval`)
                return
            } else {
                // Can send, so update last_send before other calls to `process()` also go through
                this.last_send = now
            }
        }

        // Process the next items in the queue
        const items = this.queue.splice(0, this.max_batch_size)

        // Send batch to transporter and wait for results
        for (const [item, error] of await this.send_batch(items)){

            // Handle result
            if (!error || error instanceof BadEmailAddress){
                // RESOLVE
                // Bad recipient address, only affecting this single email
                item.resolve(! (error instanceof BadEmailAddress))
                // Since succeeded, consider if interval can be reduced (if interval active)
                this.adjust_interval(true, subject_to_interval)

            } else if (error instanceof MustWait && this.interval < 60000){
                // RETRY
                // Switch to synchronous sending (if not already) with interval between sends
                // NOTE If interval has gotten too large, this is skipped & treated as normal error
                this.adjust_interval(false, subject_to_interval)
                // Readd item to queue since will probably succeed if try again
                // BUT add to end of queue in case it is the problem (and let others send first)
                // NOTE If task has since been aborted, reject with that instead
                if (this.aborted.has(item.task_id)){
                    item.reject(new TaskAborted())
                } else {
                    this.queue.push(item)
                }

            } else {
                // REJECT
                // An error occurred that requires user action to resolve
                // NOTE Assumes all items will fail, not just this one
                this.dead = true  // Prevent any more items being added to queue
                item.reject(error)  // Reject this item
                while (this.queue.length){  // Reject all items in queue
                    this.queue.shift()!.reject(error)  // Reason of failed email raised for all
                }
            }
        }

        // Continue processing more items
        void this.process(processor)
    }

    private now():number{
        // Get current time in ms
        return new Date().getTime()
    }

    private adjust_interval(success:boolean, subject_to_interval:boolean){
        // Adjust the time between sends based on whether send was successful or not

        // For when interval not yet applied...
        if (!this.interval){
            // No existing interval, so either keep that way, or init with first value
            if (!success){
                // Enable interval and disable multi-processor and batched sending
                this.interval = 1000
                this.max_processors = 1
                this.max_batch_size = 1
                console.warn("Email throttling detected (switching to single processor)")
            }
            return
        }

        // If wasn't subject to interval when started, don't let it affect interval value
        // This prevents e.g. 10 pending sends from all erroring with throttling and jumping
        //      the interval value straight up to a high number
        if (!subject_to_interval){
            return
        }

        // Rapidly increase for failure, but slowly decrease when later get success
        // NOTE ceil used so can never return to zero (would need to redesign process limiting)
        this.interval = Math.ceil(success
            ? this.interval - (this.interval / 10)  // Decrease by 10%
            : this.interval + this.interval,  // Double
        )
        console.warn(`Email sending interval set to ${this.interval}ms`)
    }

    async send_batch(items:QueueItem[]):Promise<[QueueItem, unknown][]>{
        // Send a batch of emails, detecting the appropriate transport to use
        // WARN Be sure to await batch methods so that throws caught here (otherwise uncaught)
        try {
            if (this.settings.oauth){
                // WARN Request fresh copy of oauth object for every send so expires etc correct
                const oauth = await self.app_db.oauths.get(this.settings.oauth)
                if (oauth?.issuer === 'google'){
                    return await send_batch_google(items, oauth)
                } else if (oauth?.issuer === 'microsoft'){
                    return await send_batch_microsoft(items, oauth)
                }
            } else if (this.settings.pass){
                return await send_batch_smtp(items, this.settings as EmailSettings)
            }
            // Email sending hasn't been configured yet, or was removed (e.g. oauth record deleted)
            throw new MustReconfigure()

        } catch (error){
            // If anything throws, all items get returned with that error
            return items.map(item => [item, error])
        }
    }
}
