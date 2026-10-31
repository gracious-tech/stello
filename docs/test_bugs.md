
# Bugs found while writing tests

Each bug below has at least one test that currently **fails on purpose**. Test code is marked
with a `BUG #id` comment so you can grep for it (`grep -rn "BUG #" --include=*.test.ts .`).
Once a bug is fixed, its test(s) should pass without modification.

Severity: **High** = data loss, security, or a core flow broken · **Medium** = wrong behaviour
users will hit · **Low** = edge case or cosmetic.


## App services

### #clipboard-text — `get_clipboard_text` never returns null (Low)
`app/src/services/utils/misc.ts` returns `self.navigator.clipboard.readText()` without `await`,
so the `try/catch` never catches a rejection (permission denied, empty clipboard, etc.). Callers
expecting `null` get an unhandled rejection instead.
**Fix:** `return await self.navigator.clipboard.readText()`.

### #enforce-range-nan — `enforce_range(NaN, …)` returns NaN (Low)
`app/src/services/utils/numbers.ts` treats NaN as a valid number, so it passes through
`Math.min/Math.max` unchanged. Used for message lifespans, which then won't match an AWS tag.
**Fix:** `if (typeof value !== 'number' || Number.isNaN(value))` → default.

### #http-falsy-json — `request()` drops falsy JSON bodies (Low)
`app/src/services/utils/http.ts` checks `if (init.json)`, so `json: false|0|''|null` sends no
body at all. **Fix:** `if (init.json !== undefined)`.

### #replace-dollar — `$` sequences in values are corrupted (Medium)
`replace_without_overlap()` in `app/src/services/utils/strings.ts` uses
`String.replaceAll(string, string)`, which interprets `$&`, `$$`, `` $` `` and `$'` in the
*replacement*. A message subject like "Raised $$$ for the roof" becomes "Raised $$ for the roof"
in text invites, and `$&` re-inserts the internal placeholder marker.
**Fix:** use a replacer function: `template.replaceAll(marker, () => value)`.

### #vcard-folding — folded vCard lines are truncated (Medium)
`extract_contacts_from_vcard()` (`app/src/services/misc/vcard.ts`) splits on newlines but doesn't
unfold continuation lines (RFC 6350 §3.2: CRLF followed by a space/tab). Google Contacts and
Apple export long NOTE/FN values folded at 75 chars, so imported notes/names are cut off.
**Fix:** before splitting, `data.replace(/\r?\n[ \t]/g, '')`.

### #vcard-escapes — only `\,` is unescaped in vCard values (Low)
`\n`, `\N`, `\;` and `\\` are standard vCard escapes but are left as literal text in notes.
**Fix:** unescape all of them (handle `\\` last or with a single regex replacer).

### #task-percent-nan — `Task.percent` is NaN with no subtasks (Low)
`app/src/services/tasks/tasks.ts`: `subtasks_done / safe_total` is `0/0`. **Fix:** return 0 when
`safe_total` is 0.

### #task-restart-race — restarting a task with new options doesn't wait for the old one (Medium)
`TaskManager.start()` says "wait for existing to be aborted before creating new task" but only
calls `existing.abort()` and immediately starts the new one. Both run concurrently (e.g. two
`contacts_sync` or `send_message` runs overlapping). **Fix:** `existing.abort(); await existing.done`.

### #email-throttle-retry — first retry after throttling isn't delayed (Medium)
`EmailAccountManager` (`app/src/services/email/email.ts`) only sets `last_send` once an interval
is active, so when the first `MustWait` arrives `last_send` is still 0 and the re-queued email
is retried instantly. Providers that just throttled you are hit again straight away.
**Fix:** set `this.last_send = this.now()` when switching interval on in `adjust_interval()`.

### #email-mime-headers — generated emails aren't RFC-compliant (Medium)
`create_email()` (`app/src/services/email/utils.ts`), used for the Gmail API:
- No `MIME-Version: 1.0` header (required by RFC 2045 when `Content-Type` is present).
- The HTML body is written raw with no `Content-Transfer-Encoding`, so lines from the editor can
  exceed RFC 5322's 998-char limit. Some MTAs reject or hard-wrap such messages (corrupting HTML).

**Fix:** add `MIME-Version: 1.0` and `Content-Transfer-Encoding: quoted-printable` (or base64)
and encode the body accordingly.

### #oauth-reauth-refresh-lost — reauth can wipe the stored refresh token (High)
`oauth_pretask_process()` (`app/src/services/tasks/oauth.ts`) merges `{...existing, ...auth}`, and
`oauth_authorize_complete()` always sets `token_refresh: external_encrypt(refreshToken ?? '')`.
Google typically only issues a refresh token on first consent, so after a reauth the stored token
becomes an encrypted empty string. `oauth_refresh()` only checks the ArrayBuffer is truthy, so it
tries refreshing with `''`, gets `invalid_grant`, and the user is asked to reauth again ~hourly.
**Fix:** when the token response has no `refreshToken`, keep `existing.token_refresh`.

### #oauth-refresh-rotation — rotated refresh tokens are discarded (Medium)
`oauth_refresh()` (`app/src/services/tasks/oauth.ts`) only saves the new access token. Microsoft
rotates refresh tokens on every refresh (Google may too), so the stored one eventually expires
and users are forced to reauthenticate.
**Fix:** `if (token_resp.refreshToken) oauth.token_refresh = await external_encrypt(...)`.

### #oauth-scope-sets — empty scope lists are recorded as granted (Low)
`oauth_authorize_complete()` uses `scope_set_scopes.every(...)`, which is true for `[]`. So
`'always'` is stored as a scope set for every account, and `'storage'` for every Microsoft
account (whose storage scopes are empty). Harmless today since cloud backup is Google-only,
but any future `scope_sets.includes(...)` check would be wrong for Microsoft.
**Fix:** skip `always` and require `scope_set_scopes.length > 0`.

### #cloudbackup-delete-first — failed upload leaves no cloud database backup (Medium)
`cloudbackup_sync()` (`app/src/services/tasks/cloudbackup.ts`) deletes the old
`backup_database.json` and *then* uploads the new one. If the upload fails (network, quota), the
user has no database backup on Drive until the next successful sync.
**Fix:** upload the new file first, then delete the old file by its id.

### #configs-update-race — settings changed during upload are never re-uploaded (Medium)
`configs_update()` (`app/src/services/tasks/configs.ts`) re-fetches the profile after uploading
but then sets all three `*_config_uploaded` flags to `true`. If the user changes a setting while
the upload runs (which sets a flag to `false`), that change is marked uploaded but never is, so
recipients keep seeing the old options (e.g. replies still allowed).
**Fix:** only set flags for configs this run actually uploaded, and only if they weren't
invalidated meanwhile (e.g. compare a revision counter or re-run when a flag was reset).

### #responses-sync-order — order-dependent responses applied concurrently (Medium)
`responses_receive()` (`app/src/services/tasks/responses.ts`) says "synchronous tasks must be
done in order" but runs them with `Promise.all`. A slow unsubscribe download can be applied after
a later resubscribe, leaving the contact unsubscribed.
**Fix:** `for (const fn of resp_fns_sync) await fn()`.

### #google-group-batching — 1000-member batch limit stops working after an empty group (Medium)
Contacts sync (`app/src/services/tasks/contacts.ts` ~L632) adds `group.memberCount!`, but Google
omits `memberCount` for empty groups, making the total `NaN`. Every later comparison is false,
so batches can exceed Google's 1000-member limit and the request fails for users with many groups.
**Fix:** `group.memberCount ?? 0`.

### #csv-formula-injection — exported CSVs can execute formulas (Medium, security)
`export_replies_csv()` (`app/src/services/backup/replies.ts`) and the contacts export
(`backup/contacts.ts`) call `papaparse.unparse(data)` on content written by recipients. A reply
like `=HYPERLINK("https://evil", "click")` runs as a formula when the CSV is opened in Excel or
Sheets.
**Fix:** `papaparse.unparse(data, {escapeFormulae: true})`.

### #lodash-xor — "addresses unchanged" shortcut never triggers (Low)
`contacts_change_email()` (`app/src/services/tasks/contacts.ts:760`) calls
`xor([a, b])` (one array argument) instead of `xor(a, b)`, so the result is never empty and an
unneeded update request is always sent to Google.
**Fix:** `xor(person_address_values, addresses)`.

### #contacts-create-params — `contacts_create` task reads the wrong params (Low)
`TaskManager.start_contacts_create()` passes params `[oauth_id, address]` and options `[name]`,
but `contacts_create()` reads `[oauth_id, name, address]` from params. Currently unused (the app
uses a taskless version), but it will create broken contacts if it's ever used.
**Fix:** make them agree, e.g. `this.start('contacts_create', [oauth_id, name, address])`.

### #host-progress-count — AWS setup/teardown progress never reaches 100% (Low)
`HostUserAws.update_services()` declares `task.upcoming(11)` but only 8 subtasks are tracked;
`delete_services()` declares `upcoming(7)` but tracks 6 (`app/src/services/hosts/aws_user.ts`).
**Fix:** make the `upcoming()` counts match the `expected()` calls.

### #accounts-error-message — hosted account errors always show a generic message (Medium)
`app/src/services/hosts/gracious_user.ts:87` declares `override message!:create_errors`. With
`target: ESNext` (useDefineForClassFields) this emits a real class field that resets `message`
to `undefined` after `super()`, so `RouteProfileSteps.done()` never matches `username_taken`,
`ip_limit_day` or `ip_limit_fortnight`. Users get "Something went wrong :(" instead of "try a
different username"/"wait a day", and the error also skips `app_report_error`.
**Fix:** `declare message:create_errors`.

### #image-undo-persists — "Undo changes" button never disappears (Low)
`app/src/components/dialogs/assets/DialogSectionImagesItem.vue` `image_edited()` saves even the
reverted original as a new blobstore file and reloads it as a new `Blob`, so `ImageEditBar`'s
`original !== blob` identity check stays true after undo. The image itself is reverted correctly.
**Fix:** skip saving when `blob === original`, or have `ImageEditBar` track an `edited` flag.


## Responder (Python Lambda)

### #sns-subject-invalid — self-hosted subscribe notifications fail for many names (Medium)
`_send_notification()` (`responder/aws/function/responder.py:452`) builds the SNS subject as
`f"Stello: {event['name']} wants to subscribe"`. SNS `Publish` rejects subjects that are
non-ASCII, contain control characters/newlines, or are ≥100 chars, so self-hosted users never get
notified when e.g. "José" subscribes (the error only goes to Rollbar). SES (hosted) is unaffected.
**Fix:** use a generic SNS subject ("Stello: New subscribe request") and keep the name in the
body, or ASCII-fold, strip control chars and truncate the subject.

### #responder-missing-origin — POST without an Origin header returns 500 (Low)
`entry()` reads `api_event['headers']['origin']` (lines 97 and 104) outside the try/except, so a
request without an Origin header (crawlers, bots) raises `KeyError` → Lambda error → 500 instead
of 403, adding noise to error metrics/Rollbar.
**Fix:** `origin = api_event['headers'].get('origin', '')` and use it in both places.


## Electron

### #rollbar-windows-home — Windows username leaks into error reports (Medium, privacy)
`electron/src/setup/errors.ts` `onSendCallback` replaces the home path inside
`JSON.stringify(val)`, but on Windows the home path's `\` are escaped to `\\` in JSON, so
`C:\Users\JaneDoe` never matches and reaches Rollbar unredacted (despite the SECURITY comment).
**Fix:** `.replaceAll(JSON.stringify(home).slice(1, -1), '~')` (or replace both forms).

### #update-check-unhandled — failed update checks are unhandled rejections (Low)
`electron/src/main.ts` `check_for_updates` uses `void autoUpdater.checkForUpdatesAndNotify()
.then(...)` with no `.catch` (same for `downloadPromise`). electron-updater rethrows on network
failures, so every offline startup/daily check becomes an unhandled rejection sent to Rollbar.
**Fix:** add `.catch(error => console.warn(error))` to both chains.

### #pdf-window-leak — PDF export leaks a hidden window per export (Low)
`electron/src/setup/services.ts` `html_to_pdf` never closes the offscreen `BrowserWindow`, so each
export keeps a renderer process alive until quit. If `loadFile`/`printToPDF` throws, the temp
`.html` file next to the chosen PDF path is also left behind.
**Fix:** `try {...} finally {window.destroy(); rmSync(tmp_file, {force: true})}`.


## Displayer

### #displayer-db-sync-throw — message never loads if IndexedDB throws synchronously (Medium)
`displayer/src/services/database.ts` relies on `openDB(...).catch(...)` for its non-persistent
fallback, but idb's `openDB()` calls `indexedDB.open()` synchronously, so a synchronous throw
(Safari's "invalid security context", or `indexedDB` undefined in some webviews) skips the
`.catch`. `init()` never mounts and the recipient sees the loading animation forever with no
error report (`init_errors.ts` deliberately ignores that Safari error).
**Fix:** `try { this._conn = await openDB(...) } catch { /* fallback object */ }`.

### #respond-focus-before-hover — keyboard "Comment" activation throws (Low)
`displayer/src/components/SectionRespond.vue` `focus_reply_textarea()` calls
`reply_textarea.value.focus()`, but the textarea only exists after `mouseenter` sets
`have_hovered`. Tab + Enter on the Comment button throws a TypeError, which is reported to
Rollbar and shows the "Your browser had trouble displaying this message" bar.
**Fix:** `have_hovered.value = true; await nextTick(); reply_textarea.value?.focus()` (and
consider `@focusin` on `.respondbar`).

### #subscribe-success-address — subscribe success message lacks the address (Low)
`displayer/src/components/DialogSubscribe.vue` clears `address.value` before the
`{{ address }} subscribed` success message renders, so it shows " subscribed".
**Fix:** store the address in a separate `subscribed_address` ref before clearing the form.
