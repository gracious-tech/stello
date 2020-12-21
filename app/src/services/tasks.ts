// Tasks

export class Task {
    // Represents a task for tracking its progress

    label:string = 'Task'
    subtasks_done:number = 0
    subtasks_total:number = 1
    show_count = true
    done:boolean = false

    constructor(label?:string, subtasks_total?:number, show_count?:boolean){
        // Handle basic config (but can set these after init as well if preferred)
        this.label = label ?? this.label
        this.subtasks_total = subtasks_total ?? this.subtasks_total
        this.show_count = show_count ?? this.show_count
    }

    get status(){
        // Return status string
        let status = this.label
        if (this.show_count){
            // Ensure total never less than subtasks done
            const total = Math.max(this.subtasks_total, this.subtasks_done)
            status += ` (${this.subtasks_done} of ${total})`
        }
        return status
    }

    t(promise:Promise<any>):Promise<any>{
        // Track a new subtask

        // If already reached total, increase it
        if (this.subtasks_total <= this.subtasks_done){
            this.subtasks_total += 1
        }

        // Increase done count when subtask completes
        promise.finally(() => {
            this.subtasks_done += 1
        })

        // This just wraps a promise so return the original without affecting anything
        return promise
    }

    array(promises:Promise<any>[]):Promise<any> {
        // Apply `t()` to all promises in given array and return a single promise
        return Promise.all(promises.map(p => this.t(p)))
    }

    complete(promise:Promise<any>):Promise<any>{
        // Mark task as done when given promise completes
        promise.finally(() => {this.done = true})
        return promise
    }
}
