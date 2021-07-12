
interface Credentials {
    key_id:string
    key_secret:string
}

export interface HostCredentialsPackage {
    cloud:string
    bucket:string
    region:string
    user:string
    credentials:Credentials
}
