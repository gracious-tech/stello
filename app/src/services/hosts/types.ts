
import {Task} from '@/services/tasks/tasks'


// SIMPLE TYPES


export type HostCloud = 'aws'|'gracious'  //|'google'|'azure'


export interface HostStorageGenerated {
    // Credentials and other data that is generated when creating a new storage
    credentials:unknown
    // ... and other props specific to host type
}


export interface StorageProps {
    // The properties provided when listing storages
    bucket:string
    region:string
    version:number|undefined
}


// CLASSES


export declare class HostManager {
    // Management access to host's API for creating and managing sets of storage services

    cloud:HostCloud
    credentials:unknown

    constructor(credentials:unknown)

    // Get list of storage ids for all detected in host account
    list_storages():Promise<StorageProps[]>

    // List regions that are available
    list_regions():Promise<string[]>

    // Get name for given region (since expensive in AWS, only use when necessary and cache)
    get_region_name(region:string):Promise<string>

    // See if a storage id is available
    // NOTE Returns false if taken (whether by own account or third party)
    bucket_available(bucket:string):Promise<boolean>

    // Create new storage and return credentials for it
    new_storage(bucket:string, region:string):Promise<HostStorageGenerated>

    // Delete storage
    delete_storage(task:Task, bucket:string, region:string):Promise<void>
}


export declare class HostUser {
    // User access to host's API for sending messages etc

    cloud:HostCloud
    generated:HostStorageGenerated
    bucket:string
    region:string
    user:string|null

    constructor(generated:HostStorageGenerated, bucket:string, region:string, user:string)

    // Upload a file into the storage
    upload_file(path:string, data:Blob|ArrayBuffer, lifespan?:number, max_reads?:number)
        :Promise<void>

    // Delete a file that was uploaded into storage
    delete_file(path:string):Promise<void>

    // List uploaded files (useful for deleting old messages if app lost state)
    list_files(prefix?:string):Promise<string[]>

    // Download a response file
    download_response(path:string):Promise<ArrayBuffer>

    // Delete a response file
    delete_response(path:string):Promise<void>

    // List all responses
    list_responses(type?:string):Promise<string[]>

    // Upload config for the displayer
    upload_displayer_config(config:ArrayBuffer):Promise<void>

    // Upload config for subscribe forms
    upload_subscribe_config(config:string):Promise<void>

    // Upload config for responder function
    upload_responder_config(config:ArrayBuffer):Promise<void>

    // Update email address
    update_email(address:string):Promise<void>

    // Ensure host services setup properly
    update_services(task:Task):Promise<void>

    // Delete services
    delete_services(task:Task):Promise<void>
}
