
export class CustomError extends Error {
    // Bridge for extending Error while keeping prototype and name
    constructor(message?:string){
        super(message)
        this.name = new.target.name
        Object.setPrototypeOf(this, new.target.prototype)
    }
}
