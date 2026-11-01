
# Open bugs found while writing tests

Each bug below has at least one test that currently **fails on purpose**. Test code is marked
with a `BUG #id` comment so you can grep for it (`grep -rn "BUG #" --include=*.test.ts .`).
Once a bug is fixed, its test(s) should pass without modification.

Severity: **High** = data loss, security, or a core flow broken · **Medium** = wrong behaviour
users will hit · **Low** = edge case or cosmetic.


### #task-restart-race — restarting a task with new options doesn't wait for the old one (Medium)
`TaskManager.start()` says "wait for existing to be aborted before creating new task" but only
calls `existing.abort()` and immediately starts the new one. Both run concurrently (e.g. two
`contacts_sync` or `send_message` runs overlapping). **Fix:** `existing.abort(); await existing.done`.

Not fixed yet: awaiting the old task would block `start()` (and the UI awaiting it) until a
long-running task notices the abort, and two concurrent restarts could still both start.
