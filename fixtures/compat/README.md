# Compatibility fixtures

Each `v<version>/` directory is a snapshot of data as written by that version of Stello. Every
later version is tested against all of them, so changes can't break data that existing users
already have stored (sent messages, configs, pending responses, backups), nor older app versions
still in use talking to newer hosted services.

Generated automatically by `.bin/release.mts` (via `.bin/generate_compat`) for each release.
**Never edit or regenerate a released version's fixtures** — if a test fails against them, the
code change is what breaks compatibility (fix the code, or add handling for the old format).

| File | Written by | Contains | Read by tests in |
|---|---|---|---|
| `app.json` | app | Encrypted message copy, assets, invite image, displayer/responder/subscribe configs, keys, a full backup | `displayer/src/services/compat.test.ts`, `app/src/services/compat.test.ts`, `responder/aws/tests/test_compat.py` |
| `displayer.json` | displayer | Every type of request sent to the responder (read, reply, reaction, subscription, address, resend, subscribe) | `responder/aws/tests/test_compat.py` |
| `responder.json` | responder | Encrypted responses as stored in S3 | `app/src/services/compat.test.ts` |

Keys in these files are throwaway test keys and protect nothing real.
