# Self-hosting

It is possible to host your own account and Stello can automatically setup the services you'll need on Amazon Web Services for you. However, mistakes can result in loss of data or security breaches and so self-hosting is only recommended for users with experience with cloud services.

You can also setup and share your storage with other users.

Stello requires buckets for messages and responses, as well as a responder cloud function that triggers actions and stores responses for download. It is not recommended to setup these yourself as Stello can do it automatically and has very specific needs.

Use the Storage Manager in Stello (in Settings) to create new storage accounts. You'll need to make sure you update the storage account whenever Stello itself is updated as new features or bug fixes may not work unless you do.
