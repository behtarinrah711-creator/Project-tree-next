# Saosa API foundation

This service is the migration boundary from the current browser/Firestore
persistence to PostgreSQL on the Arvan server.

The first database version stores complete application snapshots in `jsonb`.
This is intentional: the existing data can be copied and verified without
discarding fields or forcing an early final backend schema. Firebase remains
the active cloud source until migration verification is complete.

Security rules:

- PostgreSQL listens only on localhost.
- The API listens only on `127.0.0.1` and is exposed through Nginx under `/api`.
- Database passwords, session secrets and Kavenegar keys belong only in the
  server environment file and must never be committed.
- Snapshot writes use optimistic revisions to prevent silent overwrites.

Invitation delivery:

- `KAVENEGAR_INVITE_TEMPLATE=SaosaInvite` sends the project name as Kavenegar's `token`.
- `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` enable the optional email copy. If they are absent, mobile invitations continue to work and email delivery is reported as skipped.
- Project invitations remain pending for seven days. Login OTP codes are separate, single-use, and expire after three minutes.
- A pending invitation becomes an active membership only after the invited `09xxxxxxxxx` phone signs in successfully.
