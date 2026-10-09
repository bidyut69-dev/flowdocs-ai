-- Record when the requester ticked the contact-consent checkbox on /audit.
alter table public.audit_requests add column consent_at timestamptz;
