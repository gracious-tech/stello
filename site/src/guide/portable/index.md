# Portable mode
Stello can be used portably so that you can store the app and your data on an external drive if you wish to, such as for security or to use on multiple devices.

 1. Put Stello where you want it
    * __Mac:__ Move the whole `Stello` app (technically it is the `Stello.app` folder)
    * __Linux:__ Move the `stello.AppImage` file
    * __Windows:__ You must uninstall Stello and instead use [this portable version](https://releases.stello.news/electron/stello.exe) for Windows. Please note the portable version for Windows will __NOT__ auto-update and you'll have to get past several warnings to use it. This is simply due to the fact that Microsoft would charge us a lot of money to take the warnings away. There isn't a greater risk than the normal version aside from not receiving automatic updates.
 2. Move the `Stello Files` folder __next to the app__
    * The app and `Stello Files` should be in the same folder as each other
    * Putting the app into `Stello Files` will not work

Whenever Stello detects there is a `Stello Files` folder next to it, it will use that for your data instead of the default location in `Documents`.

::: tip For versions before Nov 2024...
The data folder for portable use used to be called `stello_data`. That folder should now become `Stello Files/Internal Data` as described above.
:::

::: warning
You can use this to run Stello on two different devices, but don't do it at the same time. Only keep one copy of `Stello Files` or the data will get out of sync.
:::
