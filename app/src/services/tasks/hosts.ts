
import {HostCredentialsAws} from '@/services/hosts/aws_common'
import {get_host_user} from '../hosts/hosts'
import {HostCloud} from '../hosts/types'
import {Task} from './tasks'


export async function hosts_storage_delete(task:Task):Promise<void>{
    // Task for deleting storage services

    // Unpack task params
    const [cloud, credentials, bucket, region]
        = task.params as [HostCloud, HostCredentialsAws, string, string]
    task.label = `Deleting storage "${bucket}"`
    task.show_count = true

    // Do delete
    const host_user_class = get_host_user(cloud)
    await new host_user_class({credentials}, bucket, region, null).delete_services(task)
}
