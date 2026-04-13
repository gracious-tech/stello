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


## Restoring data on a new computer
Simply put the `Stello Files` folder into your `Documents` folder on your new computer. If you already opened Stello before doing that, then that folder will already exist with blank data. In which case you can move it and replace it with the one from your old computer.

If something goes wrong and the data won't load, double check the name and location of the folder is correct. Stello automatically creates backups of your contacts and messages, so in the worst case scenario you can [restore some of your data](/guide/problem-wiped/) from them.


## For versions before Nov 2024...

If `Stello Files/Internal Data` does not exist then you started with an older version of Stello and need to do an additional step. Find the old data location as below:

 * Mac: `/Users/*username*/Library/Application Support/stello`
 * Linux: `/home/*username*/.config/stello/`
 * Windows: `C:\Users\*username*\AppData\Local\Packages\GraciousTechPtyLtd.StellobyGraciousTech_e48fz50n7vtmc\LocalCache\Roaming\stello`

You should copy the `stello` folder above into `Stello Files` and rename it to `Internal Data`. It will then be located at: `Documents/Stello Files/Internal Data`. That folder will contain various different files and folders itself. Once you've done this you can then follow the instructions above about copying the entire `Stello Files` folder to a new computer.
