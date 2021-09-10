
export function range(amount:number):Generator<number>
// tslint:disable-next-line:unified-signatures
export function range(start:number, end:number, step?:number):Generator<number>
export function* range(start_or_amount:number, end?:number, step=1):Generator<number>{
    // Generator of numbers

    // Single arg is amount, double or triple is start/end/step
    let start = 0
    if (end === undefined){
        end = start_or_amount  // amount
    } else {
        start = start_or_amount  // start
    }

    // Generate
    for (let i = start; i < end; i += step){
        yield i
    }
}


export function* cycle<T>(options:[T, ...T[]]):Generator<T, T>{  // .value is :yield|return
    // Generator that endlessly cycles through given options
    // NOTE Despite never returning, typing return as same as yield prevents .value being confused
    while (true){
        yield options[0]
        options.push(options.shift()!)
    }
}


export function* percent<T>(items:T[], percentage:number=Math.random()):Generator<T>{
    // Iterate over a certain percentage of the given items
    // Items will be semi-randomly selected resulting in a total number matching given percentage
    let yielded = 0
    for (const item of items){
        if (yielded / items.length < percentage){
            yield item
            yielded++
        }
    }
}
