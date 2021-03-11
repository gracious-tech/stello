

export function sleep(ms:number):Promise<void>{
    // Await this function to delay execution for given ms
    return new Promise(resolve => setTimeout(resolve, ms))
}


export function setIntervalPlus(amount:number, unit:'ms'|'s'|'m'|'h', instant:boolean,
        handler:()=>any):number{
    // A wrapper around setInterval providing more features
    switch (unit){
        case 'h':
            amount *= 60
        case 'm':
            amount *= 60
        case 's':
            amount *= 1000
    }
    if (instant){
        self.setTimeout(handler())  // Execute async to avoid errors affecting future setInterval
    }
    return self.setInterval(handler, amount)
}


export async function concurrent(tasks:(()=>any)[], status?:{count:number}, limit=10):Promise<void>{
    // Complete the given tasks concurrently and return promise that resolves when all done
    // NOTE AWS S3 CLI concurrency limit defaults to 10

    // Create an array to represent channels and default to already resolved promises
    // NOTE Any promises added to channels must resolve to the channel id (array index)
    const channels = [...Array(limit).keys()].map(i => Promise.resolve(i))

    // Add tasks to channels whenever one free
    for (const task of tasks){
        // Wait till at least one channel is free
        const free_channel = await Promise.race(channels)
        channels[free_channel] = task().then(() => {
            // Increment status' count and return channel so next task knows which is free
            if (status){
                status.count += 1
            }
            return free_channel
        })
    }

    // Wait till all the tasks have been completed
    await Promise.all(channels)
}
