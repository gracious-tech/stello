

export function sleep(ms:number):Promise<void>{
    // Await this function to delay execution for given ms
    return new Promise(resolve => {setTimeout(resolve, ms)})
}


export function setIntervalPlus(amount:number, unit:'ms'|'s'|'m'|'h', instant:boolean,
        handler:()=>unknown):number{
    // A wrapper around setInterval providing more features
    /* eslint-disable no-fallthrough -- expected to match multiple cases to multiply */
    switch (unit){
        case 'h':
            amount *= 60
        case 'm':
            amount *= 60
        case 's':
            amount *= 1000
    }
    /* eslint-enable no-fallthrough */
    if (instant){
        self.setTimeout(handler)  // Execute async to avoid errors affecting future setInterval
    }
    return self.setInterval(handler, amount)
}


export async function concurrent(tasks:(()=>Promise<unknown>)[], limit=10):Promise<void>{
    // Complete the given tasks concurrently and return promise that resolves when all done
    // NOTE Upon failure this will stop starting tasks, and reject after all tasks have stopped
    // WARN Rejecting straight away would leave some tasks running while main thread moves on
    // NOTE AWS S3 CLI concurrency limit defaults to 10

    // Create an array to represent channels and default to already resolved promises
    // NOTE Any promises added to channels must resolve to the channel id (array index)
    const channels = [...Array(limit).keys()].map(i => Promise.resolve(i))

    // Add tasks to channels whenever one free
    for (const task of tasks){

        // Wait for next channel to be free
        let free_channel:number
        try {
            free_channel = await Promise.race(channels)
        } catch {
            // Don't start any new tasks, but also don't throw until all in-progress have stopped
            break
        }

        // Start the task in the free channel
        channels[free_channel] = task().then(() => {
            // Return channel so next task knows which is free
            return free_channel
        })
    }

    // Wait till all the in-progress tasks have finished before throwing or returning
    for (const result of await Promise.allSettled(channels)){
        if (result.status === 'rejected'){
            throw result.reason
        }
    }
}
