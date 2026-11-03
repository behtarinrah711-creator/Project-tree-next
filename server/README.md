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


Project attachments (local storage)
----------------------------------

- Deployments bundle Linux x64 Node.js 24.22.1 and production dependencies on an Ubuntu 24.04 GitHub runner. The API service explicitly uses the release's `server/runtime/bin/node`; Ubuntu's system Node.js is not used or replaced. Before changing the server, CI verifies the packaged runtime, native JPEG encoder and server tests. Provisioning repeats the runtime/dependency check before any service changes. The archive includes `server/node_modules` and excludes only the root development `node_modules`. Nginx blocks the `/server/` directory.
- Release activation provisions and health-checks the new API before selecting the new static release. If activation fails, it restores the prior static symlink and saved API unit and attempts to restart that service. This does not roll back database migrations; they must remain backward compatible. `SAOSA_SITE_ROOT` and `SAOSA_SYSTEMD_ROOT` on the activation helper default to `/srv/saosa` and `/etc/systemd/system` (overrides are used by isolated tests).

- The first integration is the existing contact document uploader. It accepts JPEG/PNG/WebP/AVIF/HEIC input and PDF/DOCX/XLSX/PPTX documents. Images are stored only as JPEG, at most 2 MiB; document uploads are at most 25 MiB. Image input is limited to 20 MiB and 40 megapixels. EXIF orientation is applied and metadata removed. The server validates content independently of the filename and browser.
- `UPLOAD_ROOT` defaults to `/var/lib/saosa/uploads`, outside release directories and the web root. Provisioning creates this private persistent directory and grants the API service write access; Nginx allows requests up to 26 MiB. A custom root also requires updating systemd `ReadWritePaths` and directory ownership.
- Object layout: `<project-id>/contacts/<contact-id>/<file-id>/{metadata.json,original,thumbnail.jpg}`. The contact snapshot stores the file reference/metadata, never the disk path, token, base64 content, or a public URL. Replacing the local adapter with an object store preserves the API and references.
- `POST /api/v1/projects/:project/files/contacts/:contact?name=...` takes raw bytes and returns `{file}`. `GET .../:file` downloads bytes; `?variant=thumbnail` returns the small JPEG. Both require the same Bearer session and active project/module access. Owners can upload; members require write access to `people`. Files cannot be served anonymously or across projects. Responses are private and not cached by shared proxies.
- FilePond 4.32.12 is vendored with its MIT license. Image conversion, HEIC decoding, thumbnails, and storage execute locally. There are no external browser scripts, conversion services, or runtime CDNs. Dependency installation happens on the GitHub runner; the deployed server does not fetch Node.js or npm packages. Initial PostgreSQL setup still needs Ubuntu packages if PostgreSQL is absent.
- Removing a tile detaches the reference when the form is saved. Cancelling leaves the saved record intact. Physical files are retained (including abandoned uploads) to avoid breaking other saved references. Garbage collection/retention policies are a separate operational task; no automatic physical deletion is enabled.
- Back up **both** the upload directory (bytes and metadata) and PostgreSQL, with access controls and an off-server copy. The existing PostgreSQL backup job alone does not back up uploaded files. Preserve object keys when migrating storage. No live deployment or storage migration is performed by this change.
- Server limits are authoritative even when a browser cannot optimise an image; unsupported/corrupt files produce a visible error and never a successful saved reference. Native file sharing depends on browser support and a secure context, with download as fallback.
