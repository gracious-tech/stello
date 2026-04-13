
# Backup & Transfer

Stello stores all your data on your computer. It does not store it in an online account like you might be used to. Stello's sending accounts are just for the temporary display of your sent messages and can't recover anything for you. So it is important to always have a backup system running for your entire computer or otherwise manually backup Stello's data yourself.

::: danger
Always ensure Stello is closed before backing up, restoring, or moving its data folder. On Mac, ensure Stello is not active in the dock either.
:::

## Backing up data
Stello stores data in `Stello Files` in your `Documents` folder. You can copy the entire `Stello Files` folder to a backup drive or new computer.

Please ensure you copy the __entire__ folder. It will usually contain hundreds of files, and if any are missing, it may cause errors.

::: warning
Do not use the same `Stello Files` folder on two different devices or your data will get out-of-sync. Once you begin using Stello on a new device, do not open it again on the old one.
:::

You can also enable **Backup to Google Drive** from the Backups page. Note that the backup is saved to a private area of your Google Drive that only Stello can access (it won't appear as regular files in Drive). If you set an encryption password, the backup is end-to-end encrypted and unreadable by Google — keep the password safe as the backup cannot be recovered without it.

## Auto-export

Stello can also automatically export your contacts and messages to standard files readable by any software, saved to a `Backups` folder within `Stello Files`. This is useful as a last resort because it does not require Stello to be installed to access your data.


## Restoring data on a new computer
Simply put the `Stello Files` folder into your `Documents` folder on your new computer. If you already opened Stello before doing that, then that folder will already exist with blank data. In which case you can move it and replace it with the one from your old computer.

If something goes wrong and the data won't load, double check the name and location of the folder is correct. Stello automatically keeps an internal backup of your database within `Stello Files`, so if needed you can import it directly from the Backups page using **Manually Import Database**. Note this won't include images or files. The database backup file is located at:

```
Stello Files / Backups [...] / database.json
```

If you used Google Drive backup, you can restore from it on the Backups page. However, copying the `Stello Files` folder directly is preferable if available, as it includes all files and the most recent changes.


## For versions before Nov 2024...

If `Stello Files/Internal Data` does not exist then you started with an older version of Stello and the old data location would be:

 * Mac: `/Users/*username*/Library/Application Support/stello`
 * Linux: `/home/*username*/.config/stello/`
 * Windows: `C:\Users\*username*\AppData\Local\Packages\GraciousTechPtyLtd.StellobyGraciousTech_e48fz50n7vtmc\LocalCache\Roaming\stello`

However, Stello now automatically backs up its database, so you shouldn't need to worry about the Internal Data folder as long as you have updated to Stello version 1.9 or greater.
