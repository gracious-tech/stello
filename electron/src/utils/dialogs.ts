
import {existsSync} from 'original-fs'
import {join} from 'node:path'

import {app, dialog, shell} from 'electron'

import {report_error} from '../setup/errors.js'
import {write_immobile_config} from './immobile_config.js'
import {readme_filename} from './warning.js'


export function locate_files_dir():void{
    // Confirm if there's an existing files dir or should start fresh

    // Warn user and give them option to locate it
    const button_i = dialog.showMessageBoxSync({
        title: "Stello Files not found",
        message: "Stello's folder was not found in its usual location."
            + " Did you move the \"Stello Files\" folder?",
        type: 'question',
        buttons: ["Quit", "Start fresh without data", "Find folder"],
        defaultId: 2,
        cancelId: 0,
    })
    if (button_i === 0){
        return
    } else if (button_i === 1){
        // Clear saved location so default is used, then relaunch
        write_immobile_config(null)
        app.relaunch()
        return
    }

    // Loop so user can keep trying if they select the wrong folder
    while (true){
        const result = dialog.showOpenDialogSync({
            title: "Select your Stello Files folder",
            properties: ['openDirectory'],
        })
        if (!result?.[0]){
            // Picker cancelled
            return
        }

        // Confirm the selected folder looks like a Stello Files folder
        if (!existsSync(join(result[0], readme_filename))){
            const retry_i = dialog.showMessageBoxSync({
                title: "That doesn't look like a Stello Files folder",
                message: "You'll probably be starting fresh without data."
                    + " Are you sure you want to use it?",
                type: 'warning',
                buttons: ["Quit", "Use it anyway", "Choose again"],
                defaultId: 2,
                cancelId: 0,
            })
            if (retry_i === 0){
                return
            } else if (retry_i === 2){
                continue  // Choose again
            }
        }

        // Save chosen path and restart so Stello loads data from the new location
        write_immobile_config(result[0])
        app.relaunch()
        return
    }
}


// Track whether the EPERM dialog has been shown this session to avoid repeated dialogs
let eperm_dialog_shown = false


export async function warn_eperm(type:string, path:string):Promise<void>{
    // Show a dialog directing users to fix the permission issue
    // NOTE Only shows dialog once per session to avoid spamming when many file ops fail

    // Only show dialog once per session
    if (eperm_dialog_shown){
        return
    }
    eperm_dialog_shown = true

    // Send error report
    // NOTE Intentionally not sending for every error as this is mostly user's responsibility to fix
    //      It's just helpful to know how many users it is affecting
    const error_msg = `Permission error (${type})\nPath: ${path}`
    const error_id = report_error(error_msg)
    const url_desc = `${error_msg}\nError ID: ${error_id}`
    const contact_url = `https://gracious.tech/contact?desc=${encodeURIComponent(url_desc)}`

    // Mac gets a button to open the specific support page, others get the contact page
    const is_mac = process.platform === 'darwin'
    const support_url = is_mac ? 'https://stello.news/guide/problem-permission-mac/' : contact_url

    // Show a dialog explaining the permission issue
    let os_message = "You may need to check your file permission settings."
    if (is_mac){
        os_message = "Continue for instructions on how to resolve this or see the Stello guide."
    }
    // NOTE async dialog doesn't freeze app while it's open like sync does
    const button_i = await dialog.showMessageBox({
        title: "Stello can't access its own files",
        message: "Your operating system is blocking Stello from accessing its own files."
            + " This can prevent Stello from working properly. " + os_message,
        type: 'warning',
        buttons: ["Dismiss", is_mac ? "How to fix" : "Get help"],
        defaultId: 1,
        cancelId: 0,
    })

    // Open support page if user clicked the button
    if (button_i.response === 1){
        void shell.openExternal(support_url)
    }
}
