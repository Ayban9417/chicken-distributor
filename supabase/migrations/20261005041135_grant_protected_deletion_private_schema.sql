-- Public wrappers execute as service_role and resolve their transactional
-- implementation in private. No browser role receives this schema grant.
grant usage on schema private to service_role;
