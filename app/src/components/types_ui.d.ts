
interface Credentials {
    key_id:string
    key_secret:string
}

export interface HostCredentialsPackage {
    cloud:string
    bucket:string
    region:string
    api:string
    credentials:Credentials
    max_lifespan:number|null
}
