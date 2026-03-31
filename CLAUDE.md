
# Stello — Secure Interactive Newsletter Desktop App

## Project Overview

Stello is a cross-platform desktop application (Electron) for sending encrypted, interactive
newsletters ("webletters"). Users compose messages in a rich editor, send invitation emails through
their own email accounts (Gmail, Outlook, SMTP), and recipients view decrypted content in a browser.

**Key features:**
- End-to-end encryption (AES-GCM-256 symmetric, RSA-OAEP-4096 asymmetric)
- Interactive content: slideshows, videos, charts, multi-page sections
- Recipient responses: replies, reactions, per-section comments
- Message expiration and retraction
- Contact management with Google/Microsoft OAuth sync
- Self-hosted or Gracious Tech hosted cloud storage (AWS S3)
- Automatic backups with restore capability

**Created by:** Gracious Tech Pty Ltd (non-profit). Free and open source.
**Website:** stello.news

---

## Architecture & Data Flow

### Components

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Shell (electron/)                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  App (app/) — Vue 2 + Vuetify + Vuex                 │  │
│  │  Sender-side: compose, encrypt, send, manage          │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Displayer (displayer/) — Vue 3 (lightweight)               │
│  Recipient-side: decrypt & display messages in browser      │
├─────────────────────────────────────────────────────────────┤
│  Responder (responder/) — Python AWS Lambda                 │
│  Handles encrypted responses (replies, reactions, reads)    │
├─────────────────────────────────────────────────────────────┤
│  Host (host/) — AWS SAM CloudFormation                      │
│  Infrastructure: S3, Cognito, API Gateway, Lambda           │
├─────────────────────────────────────────────────────────────┤
│  Site (site/) — VitePress                                   │
│  Documentation and marketing website (stello.news)          │
└─────────────────────────────────────────────────────────────┘
```

### Message Sending Flow

1. User composes draft in App (rich text editor with TipTap)
2. Draft converted to Message → sections encrypted with per-message AES key
3. Encrypted assets uploaded to S3 via host integration
4. Invitation emails sent through user's own email account (OAuth or SMTP)
5. Each recipient gets a unique link with decryption key in URL fragment (never sent to server)

### Message Viewing Flow

1. Recipient clicks link → Displayer loads in browser
2. URL hash decoded: `#{config_secret},{msg_id},{msg_secret}`
3. Encrypted message copy downloaded from S3
4. Decrypted client-side with Web Crypto API
5. Interactive content rendered (slideshows, charts, videos)
6. Responses encrypted with host's public key, POSTed to Responder Lambda

### Response Collection Flow

1. Responder Lambda receives encrypted response
2. Validates request origin and config
3. Stores encrypted response in S3
4. Optionally sends notification via SNS (self-hosted) or SES (hosted)
5. App polls for new responses, decrypts with private key

### Shared Code

Symlinks connect shared code between app and displayer:
- `app/src/shared` → `displayer/src/shared` (components, styles)
- `displayer/src/services/utils` → `app/src/services/utils` (crypto, coding, buffers)
- `host/responder` → `responder/aws/function`

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **App UI** | Vue 2.6 + Vuetify 2.6 | Material Design component framework |
| **App State** | Vuex 3 | Centralized state with IndexedDB persistence |
| **App Routing** | Vue Router 3 (hash mode) | File protocol compatible routing |
| **App Editor** | TipTap | Rich text message composition |
| **Displayer UI** | Vue 3.2 (no Vuetify) | Lightweight recipient-side rendering |
| **Displayer i18n** | petite-vue-i18n | Lightweight internationalization |
| **Desktop** | Electron 40 | Cross-platform desktop wrapper |
| **Bundler** | Vite 2 | App and displayer builds |
| **Transpiler** | esbuild | Electron and Lambda function builds |
| **Templates** | Pug | HTML templating in Vue SFCs |
| **Styles** | SASS | Scoped component styling |
| **Database** | IndexedDB (via `idb`) | Client-side structured storage |
| **Encryption** | Web Crypto API | AES-GCM, RSA-OAEP, SHA-256 |
| **Email** | Nodemailer (SMTP), Gmail API, Microsoft Graph | Multi-transport email sending |
| **Cloud** | AWS (S3, Lambda, Cognito, SNS, API Gateway) | Serverless message hosting |
| **Responder** | Python 3.11 + AWS Lambda | Server-side response handler |
| **Infrastructure** | AWS SAM / CloudFormation | Infrastructure as code |
| **Testing** | Playwright | E2E and unit tests |
| **Linting** | ESLint + TypeScript ESLint | Code quality enforcement |
| **Type Checking** | TypeScript (strict) + vue-tsc | Type safety |
| **Packaging** | electron-builder | macOS (.dmg), Windows (.exe), Linux (.deb/.rpm/.AppImage) |
| **Error Tracking** | Rollbar | Production error reporting |
| **Site** | VitePress | Documentation and marketing |

---

## File Structure & Entry Points

```
stello_app2/
├── .bin/                    # ~60 build/dev/deploy shell scripts
│   ├── setup_node           # Installs Node 25 into .bin/nodejs
│   ├── setup_dev            # Full dev environment setup
│   ├── serve_app            # Dev server on :8000
│   ├── serve_displayer      # Dev server on :8002
│   ├── serve_electron       # Electron dev mode
│   ├── build_app            # Production app build
│   ├── build_displayer      # Production displayer build → app/static/displayer.tar
│   ├── build_electron       # Transpile electron TS → JS
│   ├── build_electron_package  # Package for all platforms
│   ├── build_responder_aws  # Package Python Lambda → app/static/responder_aws.zip
│   ├── build_host           # SAM build for AWS infrastructure
│   ├── deploy_host          # Deploy CloudFormation stack
│   ├── audit                # Run all quality checks
│   ├── audit_types          # TypeScript type checking
│   ├── audit_lint           # ESLint
│   ├── audit_test           # Unit tests
│   ├── audit_e2e_*          # E2E tests (displayer, electron)
│   └── all_node             # Run command in all Node subdirs
│
├── app/                     # Sender application (Vue 2)
│   ├── src/
│   │   ├── init.ts          # ★ App bootstrap: plugins, DB, store, tasks
│   │   ├── index.pug        # HTML template
│   │   ├── app_config.json  # App metadata, theme colors, version
│   │   ├── components/
│   │   │   ├── App.vue      # ★ Root layout, transitions, dialogs
│   │   │   ├── routes/      # Page components (Dashboard, Drafts, Messages, etc.)
│   │   │   ├── dialogs/     # Modal dialogs (generic, reusable, specific)
│   │   │   ├── global/      # Reusable form components (AppBtn, AppText, etc.)
│   │   │   ├── other/       # AppSidebar, AppStatus
│   │   │   └── splash/      # Welcome, disclaimer screens
│   │   ├── services/
│   │   │   ├── database/    # ★ IndexedDB layer, types, migrations
│   │   │   ├── store/       # Vuex store, state types, persistence
│   │   │   ├── tasks/       # Task queue system (sending, syncing, etc.)
│   │   │   ├── email/       # Email transports (SMTP, Google, Microsoft)
│   │   │   ├── hosts/       # Cloud storage (AWS, Gracious)
│   │   │   ├── backup/      # Backup/restore system
│   │   │   ├── native/      # Electron bridge abstraction
│   │   │   ├── misc/        # Recipients, templates, invites, vCard
│   │   │   └── utils/       # Crypto, HTTP, coding, arrays, strings
│   │   ├── shared/          # → symlink to displayer/src/shared
│   │   └── styles/          # Global SASS styles
│   ├── vite.config.ts       # Vite config (IIFE output, custom plugins)
│   └── static/              # Build artifacts (displayer.tar, responder_aws.zip)
│
├── displayer/               # Recipient message viewer (Vue 3)
│   ├── src/
│   │   ├── init/init.ts     # ★ Bootstrap, DB, store, mount
│   │   ├── components/      # Message display, responses, history
│   │   ├── services/
│   │   │   ├── store.ts     # ★ Reactive store, message fetch/decrypt
│   │   │   ├── responses.ts # Encrypt and send responses to responder
│   │   │   ├── database.ts  # IndexedDB for message history, reactions
│   │   │   ├── displayer_config.ts  # Config loading and decryption
│   │   │   ├── hash.ts      # URL hash parsing
│   │   │   └── utils/       # → symlink to app/src/services/utils
│   │   └── shared/          # Shared components (chart, slideshow, video, etc.)
│   ├── vite.config.ts       # Vite config (ES2015 target, Safari 10 CSS)
│   └── tests/               # Playwright E2E tests
│
├── electron/                # Desktop wrapper
│   ├── src/
│   │   ├── main.ts          # ★ Electron entry: window, auto-updater
│   │   ├── preload.ts       # IPC bridge to renderer
│   │   ├── setup/           # Errors, data paths, menus, OAuth, services, SMTP
│   │   ├── utils/           # Window management, config, paths
│   │   └── native_types.ts  # Interface exposed to web app
│   ├── electron-builder.yml # Packaging config for all platforms
│   └── tests/               # Playwright E2E tests
│
├── responder/aws/function/  # Python Lambda
│   ├── responder.py         # ★ Main handler: validate, store, notify
│   ├── email_template.py    # Notification email HTML template
│   ├── email_image.py       # Image handling
│   └── requirements.txt     # cryptography, rollbar
│
├── host/                    # AWS infrastructure
│   ├── template_base.yml    # Base CloudFormation template
│   ├── template.yml         # Generated full template
│   ├── accounts/src/        # Cognito account management Lambda (TypeScript)
│   └── manual/              # Manual deployment utilities
│
├── site/                    # Documentation website (VitePress)
│   └── src/
│       ├── guide/           # User guides and tutorials
│       ├── privacy/         # Privacy policy
│       └── terms/           # Terms of use
│
├── app_config/              # Config generation utility
├── docs/                    # Dev docs (animations, code signing, videos)
├── .github/workflows/       # CI/CD (build, security scanning)
├── .eslintrc.js             # Lint config
├── tsconfig.json            # Root TS config
├── tsconfig_base.jsonc      # Shared strict TS settings
├── tsconfig_browser.jsonc   # Browser target settings
├── tsconfig_node.jsonc      # Node target settings
└── Pipfile                  # Python deps (SAM CLI, cryptography)
```

---

## Development Setup & Commands

### Prerequisites

- Linux, macOS, or Windows
- Git

### Initial Setup

```bash
# Install project-scoped Node.js (v25) into .bin/
.bin/setup_node

# Install all dependencies (npm ci in all subdirs)
.bin/setup_dev
```

Node, npm, and npx are project-scoped in `.bin/` — use `.bin/node`, `.bin/npm`, `.bin/npx` or
prefix commands with the scripts that use them.

### Development Servers

```bash
.bin/serve_app              # App dev server on http://localhost:8000
.bin/serve_displayer        # Displayer dev server on http://localhost:8002
.bin/serve_electron         # Electron dev mode (builds + launches)
```

### Environment Variables

Copy template files and fill in values:
- `app/.env.development.local.template` → `app/.env.development.local`
- `displayer/.env.development.local.template` → `displayer/.env.development.local`
- `responder/aws/.dev_env.json.template` → `responder/aws/.dev_env.json`

Key variables: OAuth client IDs/secrets (Google, Microsoft), Rollbar tokens, AWS hosted config.

### Build Commands

```bash
.bin/build_app              # Build app (Vite, 8GB heap for Vue/Vuetify)
.bin/build_displayer        # Build displayer → app/static/displayer.tar
.bin/build_electron         # Transpile electron TS (esbuild)
.bin/build_electron_package # Package for macOS/Windows/Linux (electron-builder)
.bin/build_responder_aws    # Package Python Lambda → app/static/responder_aws.zip
.bin/build_host             # Build AWS SAM infrastructure
```

### Quality Checks

```bash
.bin/audit                  # Run ALL checks (prompts for fresh build first)
.bin/audit_types            # TypeScript type checking (vue-tsc + tsc)
.bin/audit_lint             # ESLint (all .js/.ts/.vue files)
.bin/audit_lint_errors      # ESLint errors only (no warnings)
.bin/audit_test             # Unit tests (Playwright in app/src/)
.bin/audit_e2e_displayer    # E2E tests for displayer
.bin/audit_e2e_electron     # E2E tests for electron app
```

### Deployment

```bash
.bin/deploy_host            # Deploy AWS CloudFormation stack
```

### Utility

```bash
.bin/all_node <command>     # Run command in all Node subdirs
                            # (root, app, app_config, displayer, electron,
                            #  host/accounts, host/manual)
```

---

## Code Style & Conventions

### General Rules

- **Indentation:** 4 spaces everywhere
- **Semicolons:** Never in JS/TS
- **Strings:** Single quotes by default, double quotes for UI-displayed text, preserve curly quotes
- **Line length:** 100 chars max (exceptions for HTML/Markdown)
- **Empty lines:** One at the start and end of every file
- **Comments:** At least a one-line comment for every function/class, and before every code chunk
- **If statements:** Never inline — always put the return/continue/etc on its own line

### Naming

- `snake_case` for variables and functions
- `CamelCase` for classes
- Vue prop names in templates: `snake_case` (enforced by eslint `vue/prop-name-casing`)

### TypeScript

- No space between colon and type: `name:string` not `name: string`
- Import spacing: `import {a, b} from 'x'`
- Strict mode enabled, noEmit (bundlers handle output)
- `noUnusedLocals` enabled, `noUnusedParameters` disabled

### Vue Conventions

- App uses Vue 2 class-based components with `vue-property-decorator`
- Displayer uses Vue 3 Composition API with `<script setup>`
- Templates written in Pug
- Scoped SASS styling
- Global components registered in init.ts (AppBtn, AppText, etc.)

### State Management

- Vuex mutations directly update state and persist to IndexedDB via `dict_set`
- Temporary (non-persisted) state uses `tmp_set`, `tmp_new`, `tmp_add`
- Dialogs managed via store actions returning Promises

### Error Handling

Custom exception hierarchy in `app/src/services/utils/exceptions.ts`:
- `MustReauthenticate` — OAuth token expired
- `MustReconnect` — Network failure
- `MustReconfigure` — Settings changed externally
- `MustWait` — Rate limited / throttled
- `MustRestore` — Database corruption detected
- `TaskAborted` — User cancelled operation

### File Organization

- Route components in `components/routes/` named `Route*.vue`
- Dialog components in `components/dialogs/` with generic/reusable/specific subdirs
- Global form components in `components/global/` named `App*.vue`
- Services organized by domain: `database/`, `email/`, `hosts/`, `tasks/`, `backup/`
- Shared code between app and displayer via symlinks

---

## Common Tasks & Examples

### Add a New Route/Page

1. Create `components/routes/RouteNewPage.vue`
2. Add route in `app/src/services/router.ts`
3. Add sidebar link in `components/other/AppSidebar.vue`

### Add a New Section Type

1. Define type in `app/src/services/database/types.ts` (RecordSection)
2. Create editor component in `app/src/components/routes/assets/`
3. Create displayer component in `displayer/src/shared/`
4. Handle in `RouteDraftPage.vue` for editing
5. Handle in `MessageContentsRow.vue` for display

### Add a New Response Type

1. Add handler in `responder/aws/function/responder.py`
2. Add `respond_*` function in `displayer/src/services/responses.ts`
3. Add UI component in displayer
4. Add collection logic in `app/src/services/tasks/` for fetching responses

### Modify Database Schema

1. Increment version in `app/src/services/database/migrations.ts`
2. Add migration function (sync for schema changes, async for data transforms)
3. Update types in `app/src/services/database/types.ts`
4. Update affected Database module methods

### Add a New Cloud Host Provider

1. Create manager class in `app/src/services/hosts/` (implements host interface)
2. Create user class for storage operations
3. Add to factory/switch in host initialization code
4. Update `RecordProfileHost` type

### Add a New Email Provider

1. Create transport in `app/src/services/email/`
2. Implement send method matching the email queue interface
3. Register in `EmailAccountManager`

---

## Testing & Quality

### Test Framework

Playwright is used for both unit tests and E2E tests:
- **Unit tests:** `app/src/**/*.test.ts` — run with `.bin/audit_test`
- **Displayer E2E:** `displayer/tests/` — run with `.bin/audit_e2e_displayer`
- **Electron E2E:** `electron/tests/` — run with `.bin/audit_e2e_electron`

### Existing Test Files

- `app/src/services/backup/database.test.ts` — Backup export/import
- `app/src/services/database/migrations.test.ts` — Schema migrations
- `app/src/services/misc/recipients.test.ts` — Recipient calculation logic
- `app/src/services/utils/numbers.test.ts` — Number utilities
- `displayer/tests/general.test.ts` — Basic displayer E2E
- `electron/tests/general.test.ts` — Electron app E2E

Unit tests use `fake-indexeddb` to mock IndexedDB in Node.

### Linting

ESLint with:
- `@typescript-eslint` recommended + type-checking rules
- `eslint-plugin-vue` (Vue 3 strongly recommended rules)
- `eslint-plugin-import` for import ordering
- `vue-eslint-parser` with Pug support

Key enforced rules: no semicolons, 4-space indent, 100-char lines, strict equality, snake_case
props.

### Type Checking

- `vue-tsc` for app and displayer (handles .vue files)
- `tsc` for root, electron, host/accounts
- `audit_types_filter.ts` suppresses errors from shared symlinked paths

### CI/CD

GitHub Actions (`.github/workflows/build.yml`):
1. **audit_code** — Type check, lint, unit tests
2. **build_app_base** — Build responder, displayer, app; displayer E2E
3. **build_electron** (matrix: ubuntu/macos/windows) — Build, sign (macOS), E2E, publish to S3

---

## Troubleshooting & Known Issues

### Build Issues

- **App build needs 8GB heap** — Vuetify + Vue 2 are memory-intensive. The `build_app` script
  sets `--max-old-space-size=8192`
- **Symlink issues on Windows** — Shared code uses Unix symlinks (`app/src/shared` →
  `displayer/src/shared`). Windows may need developer mode or Git symlink support enabled
- **Node version** — Must use project-scoped Node from `.bin/nodejs` (v25). System Node may
  cause incompatibilities

### Type Checking

- `audit_types_filter.ts` exists because vue-tsc reports errors from symlinked shared paths
  that belong to the other tsconfig. These are filtered out automatically
- Some `unsafe-*` TypeScript rules are set to `warn` not `error` due to Vue 2 typing limitations

### Electron

- macOS code signing requires Apple certificate (p12 format, base64-encoded for CI)
- Linux E2E tests require `xvfb-run` for headless display
- Auto-updater checks daily; validates file permissions before update

### Displayer

- Targets ES2015 and Safari 10 CSS for maximum browser compatibility
- URL hash is cleared after processing for security (key not in browser history)
- Falls back gracefully when IndexedDB unavailable (private browsing, WebViews)

### Responder

- Python `cryptography` library pinned to ~3.3.2 for Lambda compatibility
- `urllib3<2` required for boto3 compatibility

### Email Sending

- Free email accounts have daily limits (Gmail ~100-300/day, Outlook ~300/day)
- OAuth tokens expire and require re-authentication (`MustReauthenticate`)
- SMTP connections may be blocked by antivirus software

---

## Notable Dependencies

### `idb` (IndexedDB wrapper)

Thin Promise-based wrapper around IndexedDB. Used in both app and displayer. Database versioning
with sync and async migration phases — sync migrations run within the upgrade transaction, async
migrations run after DB opens.

### `@tiptap/*` (Rich text editor)

Fork of ProseMirror for Vue. Used for message composition. Supports custom extensions for
template variables (data-mention elements).

### `@zip.js/zip.js`

Used for compressing/decompressing assets. Configured with local Web Workers (CSP-compliant,
no eval). Worker scripts must be available at specific paths.

### `electron-updater`

Handles auto-updates for all platforms. Checks for updates daily. Requires proper file
permissions (validated before update attempt).

### `chart.js`

Used in both app (preview) and displayer (rendering). Displayer uses additional plugins
(`chartjs-plugin-datalabels`, etc.) for interactive charts in messages.

### `lottie-web`

Renders Lottie JSON animations in the displayer. Used for animated SVG reactions and
message content.

### AWS SDK v3

Modular imports (`@aws-sdk/client-s3`, `@aws-sdk/client-cognito-*`, etc.). Used in both
app (direct AWS operations) and electron (SMTP via nodemailer). Each service is a separate
package to minimize bundle size.

### `vue-property-decorator` / `vue-class-component`

Vue 2 class-based component syntax used throughout the app. Provides `@Prop`, `@Watch`,
`@Component` decorators. Not used in displayer (Vue 3 Composition API instead).

---

## Performance & Debugging

### Memory Considerations

- App build requires 8GB Node heap due to Vuetify tree-shaking complexity
- IndexedDB stores all messages and contacts locally — large databases may impact startup
- Blob storage (`blobstore.ts`) separates large binary assets from main DB for performance
- Email queue limits concurrent senders (10 for OAuth, 6 for SMTP) to prevent resource exhaustion

### Error Reporting

- Rollbar integration in app, displayer, and responder
- Separate Rollbar projects for each component
- Error IDs generated for user-facing error messages
- Console logging allowed for warn/error/info/debug (enforced by ESLint)

### Debugging Tools

- `.bin/serve_*` scripts run Vite dev servers with HMR
- `.bin/audit_e2e_*_debug` scripts enable Playwright debug mode (`PWDEBUG=1`)
- Vue DevTools extension loaded in Electron dev mode
- `.bin/serve_*_dist` scripts serve production builds locally for testing

### Encryption Performance

- Web Crypto API is hardware-accelerated on most platforms
- RSA-4096 operations are slow — used only for key exchange, not bulk data
- AES-GCM-256 used for bulk encryption (fast, hardware-accelerated)
- Assets encrypted individually to allow lazy loading

---

## Future Improvements

### Known Technical Debt

- **Vue 2 → Vue 3 migration:** App still uses Vue 2 with class-based components while displayer
  already uses Vue 3. Migration would unify the codebase
- **Vuex → Pinia:** Vuex 3 is in maintenance mode; Pinia is the recommended Vue state management
- **Vite 2 → current:** Both app and displayer use Vite 2; upgrading would improve build
  performance and access to newer features
- **Database refactoring:** Current branch `newdb` suggests active work on database improvements
- **Blob store migration:** `blobstore_migrate.ts` and `show_blobstore_migrate` flag indicate
  ongoing storage migration

### Potential Improvements

- Additional cloud providers (Google Cloud, Azure) for host storage
- More email provider integrations
- Offline message composition with background sync
- Multi-device support (currently single-device only for privacy)
- Additional section types for richer message content
