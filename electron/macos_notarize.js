/* eslint-disable no-undef,@typescript-eslint/no-var-requires */
// Small file and read by electron-builder so hard to compile before execution, so no TS


const notarize = require('electron-notarize')


exports.default = async function(context){
    // Run during electron build after signing

    // Don't run if not on macOS, or if not signing (i.e. testing only)
    if (context.electronPlatformName !== 'darwin' || !process.env.CSC_LINK){
        return
    }

    // Extract some config
    const appId = context.packager.appInfo.id  // appId is only exposed as `id`
    const productFilename = context.packager.appInfo.productFilename

    // Notarize
    return await notarize.notarize({
        appBundleId: appId,
        appPath: `${context.appOutDir}/${productFilename}.app`,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASS,
    })

}
