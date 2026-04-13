# My data disappeared

If when you open Stello, it shows the introductory pages, then Stello is not able to connect to its database. This could be because:

 1. You moved the `Stello Files` folder
 2. Your computer is running low on disk space
 3. Stello's database somehow got corrupted

## I moved Stello's folder by accident
To restore Stello's access to its data:

 1. Fully close Stello
    * On a Mac you'll need to ensure it's not active in the dock either
 2. Rename `Documents/Stello Files` to something else, as that will be the new empty data Stello just created when the previous data went missing
 3. Move the original `Stello Files` back to where it was before
    * If not using in portable mode, this will be `Documents/Stello Files`
 4. Open Stello


## Something else
In rare circumstances, Stello's data can become corrupted. To mitigate against this, modern versions of Stello automatically backup all your contacts and messages to the `Stello Files/Backups [...]` folder. In there you'll find all your messages in HTML and CSV formats. They can't, however, be imported back into Stello, only your contacts can.

If you regularly backup your computer, you could restore Stello's data by replacing the `Stello Files` folder with the version in the backup. If you don't backup your computer, then to get back to where you left off:

 1. Copy the backups of messages and put them in a safe place. These can't be imported back into Stello, but you can open and view them without Stello, for your own records.
 2. Import your contacts from the "All Contacts.csv" backup file (the most recent one)
 3. Follow our instructions on [transitioning to a new sending account](/guide/problem-recovery/)
