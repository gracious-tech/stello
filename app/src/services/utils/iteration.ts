
export function range(amount:number):Generator<number>
// tslint:disable-next-line:unified-signatures
export function range(start:number, end:number, step?:number):Generator<number>
export function* range(start_or_amount:number, end?:number, step:number=1):Generator<number>{
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


export function* cycle<T>(options:T[]):Generator<T>{
    // Generator that endlessly cycles through given options
    while (true){
        yield options[0]
        options.push(options.shift())
    }
}
