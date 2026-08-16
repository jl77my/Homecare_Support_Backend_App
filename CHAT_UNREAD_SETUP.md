# Persistent unread message counts

Run this migration once against the same MySQL database used by the API:

```sql
SOURCE database/chat_read_receipts_migration.sql;
```

Alternatively, open `database/chat_read_receipts_migration.sql` in MySQL
Workbench and execute the whole file.

After the migration, restart the backend. The app will then:

- load per-channel unread counts from the API after login;
- count only messages sent by other users;
- save the latest viewed message when a channel is opened; and
- keep the correct unread count after logout, login, or use on another device.
