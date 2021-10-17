
import {HostCredentialsAws} from '@/services/hosts/aws_common'
import {HOST_STORAGE_VERSION} from '@/services/hosts/common'
import {get_host_manager, get_host_user} from '../hosts/hosts'
import {HostCloud} from '../hosts/types'
import {Task} from './tasks'


export async function hosts_manager_delete(task:Task):Promise<void>{
    // Task for deleting storage services via storage manager

    // Unpack task params
    const [cloud, bucket] = task.params as [HostCloud, string]
    const [region, credentials] = task.options as [string, HostCredentialsAws]
    task.label = `Deleting storage "${bucket}"`
    task.show_count = true

    // Do delete
    const manager_class = get_host_manager(cloud)
    await new manager_class(credentials).delete_storage(task, bucket, region)
}


export async function hosts_manager_update(task:Task):Promise<void>{
    // Task for updating storage services via storage manager

    // Unpack task params
    const [cloud, bucket] = task.params as [HostCloud, string]
    const [region, credentials] = task.options as [string, HostCredentialsAws]
    task.label = `Updating storage "${bucket}"`
    task.show_count = true

    // Do update
    const host_user_class = get_host_user(cloud)
    await new host_user_class({credentials}, bucket, region, null).update_services(task)
}


export async function hosts_storage_update(task:Task):Promise<void>{
    // Task for updating storage services for a profile

    // Get profile from params
    const [profile_id] = task.params as [string]
    let profile = await self.app_db.profiles.get(profile_id)
    if (!profile){
        throw task.abort("Sending account no longer exists")
    }

    task.label = `Updating storage "${profile.display_host}"`
    task.show_count = true

    // Do update
    const host_user_class = await self.app_db.new_host_user(profile)
    await host_user_class.update_services(task)

    // Update storage version in profile
    profile = (await self.app_db.profiles.get(profile_id))!
    profile.host_state.version = HOST_STORAGE_VERSION
    await self.app_db.profiles.set(profile)
}
