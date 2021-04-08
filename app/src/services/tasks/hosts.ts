
import {HostCredentials} from '../database/types'
import {get_host_manager_storage} from '../hosts/hosts'
import {HostCloud} from '../hosts/types'
import {Task} from './tasks'


export async function hosts_storage_setup(task:Task):Promise<void>{
    // Task for setting up storage services

    // Unpack task params
    const [cloud, credentials, bucket, region]
        = task.params as [HostCloud, HostCredentials, string, string]
    task.label = `Setting up storage "${bucket}"`
    task.show_count = true

    // Do setup
    const host_manager_class = get_host_manager_storage(cloud)
    await new host_manager_class(credentials, bucket, region).setup_services(task)
}


export async function hosts_storage_delete(task:Task):Promise<void>{
    // Task for deleting storage services

    // Unpack task params
    const [cloud, credentials, bucket, region]
        = task.params as [HostCloud, HostCredentials, string, string]
    task.label = `Deleting storage "${bucket}"`
    task.show_count = true

    // Do delete
    const host_manager_class = get_host_manager_storage(cloud)
    await new host_manager_class(credentials, bucket, region).delete_services(task)
}
