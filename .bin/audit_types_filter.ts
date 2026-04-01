// Filters tsc output via stdin, ignoring paths that are duplicates (symlinks) or unsolveable
// WARN Currently only expected to be run for `app/src` checking


// When in keep mode, output is not silenced
let keep = true


// Receive data from stdin
process.stdin.on('data', data => {
    for (let line of data.toString('utf-8').split('\n')){

        // Remove color codes so can filter plain text
        // eslint-disable-next-line no-control-regex
        const plain_line = line.replace(/\u001b\[.*?m/g, '')

        // Re-assess keep upon each new file
        if (plain_line.includes(' error TS')){
            // Ignore shared files as Vue 2 can't type check correctly, and displayer will anyway
            // Ignore TS2528/TS2339 as they're Vue 2 class component limitations
            keep = !plain_line.startsWith('app/src/shared/')
                && !plain_line.includes('error TS2528')
                && !plain_line.includes('error TS2339')
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
