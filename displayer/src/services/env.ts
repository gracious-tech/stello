
export const MSGS_URL =
    import.meta.env.DEV ? '/dev/' : (import.meta.env.VITE_HOSTED_MSGS_URL ?? '/')

export const USER =
    import.meta.env.VITE_HOSTED_MSGS_URL ? self.location.hostname.split('.')[0]! : '_user'
