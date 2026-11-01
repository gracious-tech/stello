
# Open bugs found while writing tests

Each bug below has at least one test that currently **fails on purpose**. Test code is marked
with a `BUG #id` comment so you can grep for it (`grep -rn "BUG #" --include=*.test.ts .`).
Once a bug is fixed, its test(s) should pass without modification.

Severity: **High** = data loss, security, or a core flow broken · **Medium** = wrong behaviour
users will hit · **Low** = edge case or cosmetic.


### #configs-update-race — settings changed during upload are never re-uploaded (Medium)
`configs_update()` (`app/src/services/tasks/configs.ts`) re-fetches the profile after uploading
but then sets all three `*_config_uploaded` flags to `true`. If the user changes a setting while
the upload runs (which sets a flag to `false`), that change is marked uploaded but never is, so
recipients keep seeing the old options (e.g. replies still allowed).
**Fix:** only set flags for configs this run actually uploaded, and only if they weren't
invalidated meanwhile (e.g. compare a revision counter or re-run when a flag was reset).

Not fixed yet: needs a design decision (e.g. a revision counter or re-running when a flag
was reset mid-upload).

### #task-restart-race — restarting a task with new options doesn't wait for the old one (Medium)
`TaskManager.start()` says "wait for existing to be aborted before creating new task" but only
calls `existing.abort()` and immediately starts the new one. Both run concurrently (e.g. two
`contacts_sync` or `send_message` runs overlapping). **Fix:** `existing.abort(); await existing.done`.

Not fixed yet: awaiting the old task would block `start()` (and the UI awaiting it) until a
long-running task notices the abort, and two concurrent restarts could still both start.

### #email-mime-headers — generated emails aren't RFC-compliant (Medium)
`create_email()` (`app/src/services/email/utils.ts`), used for the Gmail API:
- No `MIME-Version: 1.0` header (required by RFC 2045 when `Content-Type` is present).
- The HTML body is written raw with no `Content-Transfer-Encoding`, so lines from the editor can
  exceed RFC 5322's 998-char limit. Some MTAs reject or hard-wrap such messages (corrupting HTML).

**Fix:** add `MIME-Version: 1.0` and `Content-Transfer-Encoding: quoted-printable` (or base64)
and encode the body accordingly.

Not fixed yet: changes the raw format of every Gmail-API email, so it should be verified
against real Gmail before shipping. The passing `produces rfc headers and html body` test
asserts the exact current headers/body and will need updating alongside the fix.
