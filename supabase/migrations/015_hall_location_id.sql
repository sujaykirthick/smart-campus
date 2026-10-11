-- 015_hall_location_id.sql
-- Add location_id text null to halls table to link campus venues to map location records

alter table public.halls
add column if not exists location_id text null;

-- Comment for schema documentation
comment on column public.halls.location_id is 'Reference to stable ID in data/campus-locations.json (e.g. P008)';
