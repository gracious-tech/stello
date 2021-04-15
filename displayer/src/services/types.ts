
export type GetAsset = (asset_id:string)=>Promise<ArrayBuffer>


declare global {
    interface ImportMeta {
        // Extend with vite's env vars that are always exposed
        env:{
            MODE:string,
            BASE_URL:string,
            PROD:boolean,
            DEV:boolean,
        }
    }
}
