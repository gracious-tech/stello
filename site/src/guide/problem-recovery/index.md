
# Recovering data

If Stello's data has gone missing or become inaccessible, it may be able to be recovered depending on the cause.

## Restoring from a backup

If you have a computer backup, you can restore Stello's data by replacing the `Stello Files` folder with the version from your backup. If you had Google Drive backup enabled in Stello, you can also [restore from that](/guide/backup/).

::: danger
Always ensure Stello is closed before backing up, restoring, or moving its data folder. On Mac, ensure Stello is not active in the dock either.
:::

## Data disappeared on startup

If Stello shows the introductory pages when you open it, it cannot connect to its database. This is usually because:

 1. You moved the `Stello Files` folder
 2. Your computer is running low on disk space
 3. Stello's database somehow got corrupted

### If you moved Stello's folder

To restore Stello's access to its data:

 1. Fully close Stello
    * On a Mac you'll need to ensure it's not active in the dock either
 2. Rename `Documents/Stello Files` to something else — this is the empty data folder Stello created when it couldn't find the original
 3. Move the original `Stello Files` back to its previous location
    * If not using portable mode, this should be `Documents/Stello Files`
 4. Open Stello

### If you didn't move the folder
The database has likely become corrupted. You should see a prompt on the Dashboard to restore from a backup.


## If you can't restore a full backup

If you have no full backup to restore from, here's what to know about your sending account and how to recover what you can.

**Good news:** You can create a new sending account at any time and reuse the same email address. Your existing sent messages remain readable by recipients and will expire as normal.

**Bad news:** Sending accounts only store temporary sent messages — everything else stays on your device for security reasons, including the means of decrypting responses from readers. So:

 * You can't log back into your sending account
 * You can't recover any data from your sending account
 * You can't decrypt any further responses readers send
 * You can't reuse the same username

### Deactivating your old account

You'll want to deactivate your old account so recipients don't send replies you can no longer access.

[Contact us](https://gracious.tech/contact) using the same email address you used for Stello and let us know:

 1. Your old username
    * Found at the start of any link in previous messages you sent, and also in the subject of email notifications from Stello
 2. Whether you'd like to:
    * **Delete the account**: All previously sent messages disappear and recipients can no longer read them
    * **Disable the account**: Recipients can still read your old messages until they expire, but can no longer respond to them

### Recovering contacts

Stello automatically backs up your contacts and messages to the `Stello Files/Backups [...]` folder. In there you'll find all your messages in HTML and CSV formats. They can't be imported back into Stello, but your contacts can. To get back to where you left off:

 1. Copy any message backups somewhere safe — you can open and view them without Stello, for your own records
 2. Import your contacts from the "All Contacts.csv" backup file (use the most recent one)
 3. Create a new sending profile and reconfigure your settings

If you have no contacts in `Stello Files/Backups [...]` and you didn't sync with Google Contacts, there's one last option. For some email accounts such as Gmail, you can recover your contact list by searching through the "Sent" folder in your email app. Stello sends an individual email to each recipient, so searching for the title of a previous newsletter should show an email for each recipient, letting you recover their addresses.
