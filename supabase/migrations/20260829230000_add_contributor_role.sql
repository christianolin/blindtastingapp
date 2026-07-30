-- Add the CONTRIBUTOR role (between MEMBER and ADMIN): may edit knowledge content
-- and archetype placements, but not user roles. Added in its own migration so the
-- new enum value is committed before the next migration's policies reference it
-- (Postgres forbids using a freshly-added enum value in the same transaction).
alter type user_role add value if not exists 'CONTRIBUTOR';
