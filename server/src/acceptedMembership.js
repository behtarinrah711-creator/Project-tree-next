// Bind acceptance to the invitation that granted the current membership role.
export const acceptedMembership = `EXISTS (
  SELECT 1 FROM project_invitations i
   WHERE i.project_id=m.project_id AND i.phone=a.phone AND i.status='accepted'
     AND i.accepted_at IS NOT NULL AND r.role_key='invite-' || left(i.id::text,8)
)`;
