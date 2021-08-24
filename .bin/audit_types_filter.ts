// Filters tsc output via stdin, ignoring paths that are duplicates (symlinks) or unsolveable
// WARN Currently only expected to be run for `app/src` checking


// Collect output so know if should return error or not (no output is success)
// NOTE Later trimmed so that blank lines don't trigger failure
let output = ''


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

        // Log the line and append to output cache
        if (keep){
            console.log(line)
            output += line
        }
    }
})


// Exit when stdin is exhausted
process.stdin.on('finish', () => {
    // Fail if any output
    process.exit(output.trim() ? 1 : 0)
})
