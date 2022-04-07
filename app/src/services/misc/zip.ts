
import * as zip from '@zip.js/zip.js'
import zip_worker from '@zip.js/zip.js/dist/z-worker?url'  // Worker must be separate local script


// Configure zip module to use static local worker scripts rather than blobs to avoid CSP issues
// NOTE Must pass absolute URL otherwise zip.js will try resolve relative to own script and mess up
// WARN URL must work in both dev and prod (have very different paths!)
const zip_worker_path = new URL(zip_worker, self.location.href).toString()
zip.configure({
    workerScripts: {
        deflate: [zip_worker_path],
        inflate: [zip_worker_path],
    },
})


export {zip}
