
export interface AppConfig {
    version:string
    theme_codes:{
        primary:[string, string],
        accent:[string, string],
        error:[string, string],
    }
    codename:string
    domain:string
    name:string
    short_name:string
    description:string
    author:{
        name:string,
        email:string,
    }
    theme?:AppConfigTheme  // Auto-created
}


export interface AppConfigTheme {
    primary:string
    primary_lighter:string
    primary_darker:string
    accent:string
    accent_lighter:string
    accent_darker:string
    error:string
    error_lighter:string
    error_darker:string
    on_primary:string
    on_primary_lighter:string
    on_primary_darker:string
    on_accent:string
    on_accent_lighter:string
    on_accent_darker:string
    on_error:string
    on_error_lighter:string
    on_error_darker:string
}
