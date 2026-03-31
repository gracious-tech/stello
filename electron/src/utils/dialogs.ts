
import {existsSync} from 'original-fs'
import {join} from 'node:path'

import {app, dialog} from 'electron'

import {write_immobile_config} from './immobile_config'
import {readme_filename} from './warning'


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
