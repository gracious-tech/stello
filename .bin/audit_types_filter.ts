// Filters tsc output via stdin, ignoring paths that are duplicates (symlinks) or unsolveable
// WARN Currently only expected to be run for `app/src` checking


// When in keep mode, output is not silenced
let keep = true


// Receive data from stdin
process.stdin.on('data', data => {
    for (let line of data.toString('utf-8').split('\n')){

        // Remove color codes so can filter plain text
        const plain_line = line.replace(/\u001b\[.*?m/g, '')

        // Re-assess keep upon each new file
        if (plain_line.includes(' error TS')){
            // Ignore shared files as Vue 2 can't type check correctly, and displayer will anyway
            keep = !plain_line.startsWith('app/src/shared/')
        }

        if (keep){
            // Output the line
            console.log(line)
            // Cause script to end with failure if line not empty
            if (line.trim()){
                process.exitCode = 1
            }
        }
    }
})
