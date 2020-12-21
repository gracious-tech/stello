

declare module 'CustomTypes' {

    global {

        interface Window {
            _browser_supported:boolean
            _hash:string
            _error_to_msg(error:Error):string
            _fail(msg:string):void
            _fail_network():void
            __fail_alert(heading:string, msg:string):void
            _app:any
        }

        interface String {
            replaceAll(from:string|RegExp, to:string|Function):string
        }
    }

}
