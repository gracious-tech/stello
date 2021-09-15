// Tasks

import Vue from 'vue'
import {isEqual} from 'lodash'

import {remove_item, remove_matches} from '../utils/arrays'
import {configs_update} from './configs'
import {responses_receive} from './responses'
import {contacts_oauth_setup, contacts_sync, contacts_change_property, contacts_change_email,
    contacts_remove} from './contacts'
import {send_oauth_setup, send_message} from './sending'
import {MustReauthenticate, MustReconfigure, MustReconnect, MustWait} from '../utils/exceptions'
import {hosts_storage_setup, hosts_storage_delete} from './hosts'
import {retract_message} from './management'


export type TaskStartArgs = [string, any[]?, any[]?]
// Task functions return a promise which may resolve to single/array of other subtask promises
export type TaskReturn = Promise<Promise<any>|Promise<any>[]|void>
export type TaskErrorType = 'network'|'auth'|'settings'|'throttled'|'unknown'
export type TaskFunction = (task:Task)=>TaskReturn


// Create a map of task function names to the actual function
const TASKS:Record<string, TaskFunction> = Object.fromEntries([
    contacts_oauth_setup, contacts_sync, contacts_change_property, contacts_change_email,
    contacts_remove,
    send_oauth_setup, send_message,
    configs_update,
    responses_receive,
    hosts_storage_setup, hosts_storage_delete,
    retract_message,
].map(fn => [fn.name, fn]))


export class TaskAborted extends Error {
    // The error returned when a task has been aborted
}


export class Task {
    // Represents a task for tracking its progress

    // Configurable
    label:string|null = null
    show_count = false
    fix_settings:(()=>Promise<void|string>)|null = null  // Return error string to abort failed task
    fix_auth:(()=>Promise<void|string>)|null = null  // Return error string to abort failed task
    fix_oauth:string|null = null  // Don't provide actual oauth obj as should get fresh when needed

    // Readable
    name:string  // May be changed if evolving
    readonly params:any[]  // Must be serializable for storing as post-oauth actions
    readonly options:any[]  // Must be serializable for storing as post-oauth actions
    readonly done:Promise<any>  // Resolves with an error value (if any) when task done
    abortable = false  // Whether task can be manually aborted (always internally abortable)
    aborted:TaskAborted|null = null  // An abort error if task has been aborted
    error:any = null  // Error value is both resolved for `done` and set as a property
    error_report_id:string|null = null  // UUID for error report (if was sent)
    subtasks_done = 0
    subtasks_total = 0

    // Private
    private done_resolve:(error:any)=>void

    constructor(name:string, params:string[], options:string[]){
        this.name = name
        this.params = params
        this.options = options
        // Create promise so anything with access to the task (such as caller) can know when stopped
        // NOTE Also needed internally to wait for a task to abort
        this.done = new Promise(resolve => {
            this.done_resolve = resolve
        })
    }

    get id():string{
        // Return id for using as key in v-for (if used any other way, re-evaluate design)
        return `${this.name} ${this.params.join(' ')}`
    }

    get display():string{
        // Display the task in a way that is always helpful for UI
        return this.label || this.name
    }

    get safe_total():number{
        // Return subtasks total, ensuring it is never accidentally less than number completed
        return Math.max(this.subtasks_total, this.subtasks_done)
    }

    get status():string{
        // Return status string
        let status = this.display
        if (this.show_count && !this.aborted){
            status += ` (${this.subtasks_done} of ${this.safe_total})`
        }
        return status
    }

    get percent():number{
        // Work out percentage complete
        return Math.floor(this.subtasks_done / this.safe_total * 100)
    }

    get error_type():TaskErrorType|null{
        // Detect the type of error
        if (!this.error){
            return null
        } else if (this.error instanceof MustReconnect){
            return 'network'
        } else if (this.error instanceof MustReauthenticate){
            return 'auth'
        } else if (this.error instanceof MustReconfigure){
            return 'settings'
        } else if (this.error instanceof MustWait){
            return 'throttled'
        }
        return 'unknown'
    }

    async expected<T>(promise:Promise<T>):Promise<T>
    async expected<T>(...promises:Promise<T>[]):Promise<T[]>
    async expected<T>(...promises:Promise<T>[]):Promise<T|T[]>{
        // Track the completion of subtasks that are already expected (counted)

        // Increase done count when subtasks complete
        for (const promise of promises){
            promise.finally(() => {
                this.subtasks_done += 1
            })
        }

        // If just a single promise, return as is
        if (promises.length === 1){
            return promises[0]
        }

        // Wait till all promises done, whether resolved or rejected, and return array of values
        // NOTE This is different to Promise.all() which would reject before all promises are done
        // NOTE If any error, just reject with first one, as impossible to know which finished first
        return (await Promise.allSettled(promises)).map(result => {
            if (result.status === 'rejected'){
                throw result.reason
            }
            return result.value
        })
    }

    add<T>(promise:Promise<T>):Promise<T>
    add<T>(...promises:Promise<T>[]):Promise<T[]>
    add<T>(...promises:Promise<T>[]):Promise<T|T[]>{
        // Track subtasks and increase the total count
        this.subtasks_total += promises.length
        return this.expected(...promises)
    }

    upcoming(num:number){
        // Increase subtasks total by given number of upcoming tasks
        // NOTE Useful when the number is known before having access to the actual promises
        this.subtasks_total += num
    }

    abort(reason?:string):TaskAborted{
        // Abort ASAP by setting the aborted property which tasks will periodically check
        // NOTE When called within tasks, should also throw the returned value
        this.aborted = new TaskAborted(reason)
        return this.aborted
    }

    check_aborted():void{
        // Check if the task has been manually aborted and throw the abort error if so
        if (this.aborted){
            throw this.aborted
        }
    }

    finish(error:any=null){
        // Resolve task's done promise, optionally setting and resolving done with error if any
        this.error = error
        if (this.error_type === 'unknown'){
            this.error_report_id = self.app_report_error(error)
        }
        this.done_resolve(error)
    }

    evolve(task_function:TaskFunction):TaskReturn{
        // Turn into a different task
        // WARN If task fails the task that will be retried is the new task, not the old
        this.name = task_function.name
        return task_function(this)
    }
}


export class TaskManager {

    data:{tasks:Task[], fails:Task[], finished:Task} = Vue.observable({
        tasks: [],
        fails: [],
        finished: null,  // Only stores last task to have finished
    })

    async start(name:string, params:any[]=[], options:any[]=[]):Promise<Task>{
        // Register the task identified by given code and params

        // See if an existing task matches code and params
        const existing = this.data.tasks.find(t => t.name === name && isEqual(t.params, params))
        if (existing){
            // If options also match, can skip creating this task and return the existing's promise
            if (isEqual(existing.options, options)){
                return existing
            }
            // Since options are different, wait for existing to be aborted before creating new task
            existing.abort()
        }

        // Create new task and add to list
        const task = new Task(name, params, options)
        this.data.tasks.push(task)

        // Clear any existing fail
        remove_matches(this.data.fails, (failed_task:Task) => {
            return failed_task.name === task.name && isEqual(failed_task.params, task.params)
        })

        // Start doing the work
        TASKS[name](task).then(async subtasks => {
            // If task returns a value, they are subtasks to be tracked and awaited
            if (subtasks){
                await task.add(...(Array.isArray(subtasks) ? subtasks : [subtasks]))
            }
            // Return null since no error thrown
            return null
        }).catch(error => {
            // Return value of `then` is null, so simply return error to mark task as failed
            return error
        }).then((error:any) => {
            // Resolve task's promise with error if any
            task.finish(error)
            // Remove task from active list
            remove_item(this.data.tasks, task)
            // If no error, or task was aborted, put in finished (otherwise append to fails)
            if (error === null || task.aborted){
                this.data.finished = task
            } else {
                this.data.fails.push(task)
            }
        })

        return task
    }

    abort_failed(task:Task, reason?:string):void{
        // Abort a task that has already failed
        task.abort(reason)
        remove_item(this.data.fails, task)
        this.data.finished = task
    }

    // Start methods for sake of tying expected arguments to task names

    start_contacts_sync(oauth_id:string):Promise<Task>{
        return this.start('contacts_sync', [oauth_id])
    }

    start_contacts_change_property(oauth_id:string, contact_id:string, property:'name'|'notes',
            value:string):Promise<Task>{
        return this.start('contacts_change_property', [oauth_id, contact_id, property], [value])
    }

    start_contacts_change_email(oauth_id:string, contact_id:string, addresses:string[],
            chosen:string):Promise<Task>{
        return this.start('contacts_change_email', [oauth_id, contact_id], [addresses, chosen])
    }

    start_contacts_remove(oauth_id:string, contact_id:string):Promise<Task>{
        return this.start('contacts_remove', [oauth_id, contact_id])
    }

    start_configs_update(profile_id:string):Promise<Task>{
        return this.start('configs_update', [profile_id])
    }

    start_send_message(msg_id:string):Promise<Task>{
        return this.start('send_message', [msg_id])
    }

    start_responses_receive():Promise<Task>{
        return this.start('responses_receive')
    }
}


export const task_manager = new TaskManager()
