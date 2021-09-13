
export function sleep(ms:number):Promise<void>{
    // Await this function to delay execution for given ms
    return new Promise(resolve => {setTimeout(resolve, ms)})
}
