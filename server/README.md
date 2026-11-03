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

- Requires Node.js 20.9 or newer for the pinned image-processing packages. Provisioning checks this before installing dependencies; an older server runtime must be upgraded first.

- The first integration is the existing contact document uploader. It accepts JPEG/PNG/WebP/AVIF/HEIC input and PDF/DOCX/XLSX/PPTX documents. Images are stored only as JPEG, at most 2 MiB; document uploads are at most 25 MiB. Image input is limited to 20 MiB and 40 megapixels. EXIF orientation is applied and metadata removed. The server validates content independently of the filename and browser.
- `UPLOAD_ROOT` defaults to `/var/lib/saosa/uploads`, outside release directories and the web root. Provisioning creates this private persistent directory and grants the API service write access; Nginx allows requests up to 26 MiB. A custom root also requires updating systemd `ReadWritePaths` and directory ownership.
- Object layout: `<project-id>/contacts/<contact-id>/<file-id>/{metadata.json,original,thumbnail.jpg}`. The contact snapshot stores the file reference/metadata, never the disk path, token, base64 content, or a public URL. Replacing the local adapter with an object store preserves the API and references.
- `POST /api/v1/projects/:project/files/contacts/:contact?name=...` takes raw bytes and returns `{file}`. `GET .../:file` downloads bytes; `?variant=thumbnail` returns the small JPEG. Both require the same Bearer session and active project/module access. Owners can upload; members require write access to `people`. Files cannot be served anonymously or across projects. Responses are private and not cached by shared proxies.
- FilePond 4.32.12 is vendored with its MIT license. Image conversion, HEIC decoding, thumbnails, and storage execute locally. There are no external browser scripts, conversion services, or runtime CDNs. Installing dependencies during deployment still needs package availability; an already deployed uploader does not.
- Removing a tile detaches the reference when the form is saved. Cancelling leaves the saved record intact. Physical files are retained (including abandoned uploads) to avoid breaking other saved references. Garbage collection/retention policies are a separate operational task; no automatic physical deletion is enabled.
- Back up **both** the upload directory (bytes and metadata) and PostgreSQL, with access controls and an off-server copy. The existing PostgreSQL backup job alone does not back up uploaded files. Preserve object keys when migrating storage. No live deployment or storage migration is performed by this change.
- Server limits are authoritative even when a browser cannot optimise an image; unsupported/corrupt files produce a visible error and never a successful saved reference. Native file sharing depends on browser support and a secure context, with download as fallback.
