
// Setup run before every app unit test file

// Alias `self` to global scope as app code expects a browser/worker-like environment
const _global = globalThis as Record<string, unknown>
if (typeof _global['self'] === 'undefined'){
    _global['self'] = globalThis
}

// Some modules resolve URLs relative to the page at import time
if (typeof _global['location'] === 'undefined'){
    _global['location'] = new URL('http://localhost/')
}

// happy-dom lacks the Option constructor that browsers provide (used for html escaping)
if (typeof _global['document'] !== 'undefined' && typeof _global['Option'] === 'undefined'){
    _global['Option'] = function(text=''){
        const option = document.createElement('option')
        option.textContent = text
        return option
    }
}
