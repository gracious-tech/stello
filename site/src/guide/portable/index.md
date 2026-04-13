# Portable mode
Stello can be used portably so that you can store the app and your data on an external drive if you wish to, such as for security or to use on multiple devices.

::: warning
Ensure Stello is fully closed before moving it or its data, and only use it on one device at a time or the data will get out of sync.
:::

 1. Put Stello where you want it
    * __Mac:__ Move the whole `Stello` app (technically it is the `Stello.app` folder)
    * __Linux:__ Move the `stello.AppImage` file
    * __Windows:__ You must uninstall Stello and instead use [this portable version](https://releases.stello.news/electron/stello.exe) for Windows. Please note the portable version for Windows will __NOT__ auto-update and you'll have to get past several warnings and disable Smart App Control to use it. We don't recommend this unless you understand the risks involved.
 2. Move the `Stello Files` folder __next to the app__
    * The app and `Stello Files` should be in the same folder as each other
    * Putting the app into `Stello Files` will not work

Whenever Stello detects there is a `Stello Files` folder next to it, it will use that for your data instead of the default location in `Documents`.

::: tip For versions before Nov 2024...
The data folder for portable use used to be called `stello_data`. That folder should now become `Stello Files/Internal Data` as described above.
:::


## Storing data somewhere else
If you only want to store Stello's data somewhere else, you can simply move `Stello Files` (after closing Stello) wherever you like. Then, when you open Stello again it will ask where you put it.
