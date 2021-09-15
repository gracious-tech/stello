
import {TaskAborted} from '../tasks/tasks'
import {generate_token} from '../utils/crypt'
import {EmailSettings, Email, EmailError} from '../native/types'
import {MustInterpret, MustReauthenticate, MustReconfigure, MustReconnect, MustWait}
    from '../utils/exceptions'


// Preserve instances of smtp accounts so throttling is account-wide, not per task
const ACCOUNT_MANAGERS:Record<string, SmtpAccountManager> = {}


function transport_id_from_settings(settings:EmailSettings):string{
    // Generate transport id from settings
    return JSON.stringify(
        [settings.host, settings.port, settings.starttls, settings.user, settings.pass])
}


export function new_smtp_task(settings:EmailSettings){
    // Start a new smtp task for sending emails associated with one another

    // Use single manager for single host-user so throttling is cross-task per account
    // NOTE id made up of all settings so that if any change, the change will take effect
    // NOTE This means that can potentially have multiple instances for single user
    //      but in that case only one of them is likely to actually work anyway
    const transport_id = transport_id_from_settings(settings)

    // Init a new manager if it doesn't exist or is dead
    let manager = ACCOUNT_MANAGERS[transport_id]
    if (!manager || manager.dead){
        manager = ACCOUNT_MANAGERS[transport_id] = new SmtpAccountManager(settings)
    }

    // Give the task a new id so that any abort only happens to emails belonging to this task
    const task_id = generate_token()

    // Provide access to send and abort methods
    return {
        send: (email:Email) => manager!.send(task_id, email),
        abort: () => manager!.abort(task_id),
    }
}


interface SmtpQueueItem {
    email:Email
    task_id:string
    resolve:(success:boolean)=>void
    reject:(reason:Error)=>void
}


class SmtpAccountManager {

    settings:EmailSettings
    queue:SmtpQueueItem[] = []
    processors = new Set<string>()
    max_processors = 10  // Same as native limit
    last_send = 0  // Epoch time
    interval = 0  // ms
    dead = false  // Prevents instance from being used by throwing when try to send
    aborted = new Set<string>()

    constructor(settings:EmailSettings){
        this.settings = settings
    }

    async send(task_id:string, email:Email):Promise<boolean>{
        // Schedule sending of given email and resolve with success boolean when done
        // NOTE Will throw error for anything other than a problem with recipient's address

        // Prevent queuing of any more emails if transport is declared dead
        // WARN Otherwise could end up in situation where promise is never resolved
        if (this.dead){
            throw new Error("SMTP transport is dead but was still given an email to send")
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
        /* Process an item in the queue
            Now matter how rapidly this is called, items will still be processed at appropriate rate
                1. SMTP pool used which will limit simultaneous sends to max number of connections
                2. If interval set, sends will happen synchronously despite SMTP pool's async nature

            WARN `process()` is not scheduled and must be called until no items left
                Called after each new item added, and recalls itself until queue empty
        */

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
                console.debug(`SMTP waiting ${time_till_can_send + buffer}ms due to interval`)
                return
            } else {
                // Can send, so update last_send before other calls to `process()` also go through
                this.last_send = now
            }
        }

        // Process the next item in the queue
        const item = this.queue.shift()!

        // Add to node mailer's own queue and wait till it actually sends
        const error = await self.app_native.smtp_send(this.settings, item.email)
            .catch(():EmailError => ({code: 'unknown', details: 'app_native.smtp_send throw'}))

        // Handle result
        if (!error || error.code === 'invalid_to'){
            // RESOLVE
            // Bad recipient address, only affecting this single email
            item.resolve(error?.code !== 'invalid_to')
            // Since succeeded, consider if interval can be reduced (if interval active)
            this.adjust_interval(true, subject_to_interval)

        } else if (error.code === 'throttled' && this.interval < 60000){
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

            // Convert email error to a standard error object
            let reason:Error
            if (['dns', 'starttls_required', 'tls_required', 'timeout'].includes(error.code)){
                reason = new MustReconfigure(error.details)
            } else if (error.code === 'auth'){
                reason = new MustReauthenticate(error.details)
            } else if (error.code === 'network'){
                reason = new MustReconnect(error.details)
            } else if (error.code === 'throttled'){
                reason = new MustWait(error.details)
            } else {
                reason = new MustInterpret(error)
            }

            // An error occurred that requires user action to resolve
            // NOTE Assumes all items will fail, not just this one
            this.dead = true  // Prevent any more items being added to queue
            item.reject(reason)  // Reject this item
            while (this.queue.length){  // Reject all items in queue
                this.queue.shift()!.reject(reason)  // Reason of failed email raised for all
            }
        }

        // Continue processing another item
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
                this.interval = 1000
                // Only one processor now needed
                this.max_processors = 1
                console.warn("SMTP throttling detected (switching to single processor)")
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
        console.warn(`SMTP interval set to ${this.interval}ms`)
    }
}
