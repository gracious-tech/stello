
import {HostStorageGenerated} from '@/services/hosts/types'


export interface HostCredentialsPackage {
    cloud:string
    bucket:string
    region:string
    generated:HostStorageGenerated
}
