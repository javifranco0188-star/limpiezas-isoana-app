-- Ejecuta esto una vez en Supabase: Dashboard > SQL Editor > New query > pega y Run.
-- Añade la columna donde se guarda el push token de cada usuario (personal/admin).

alter table public.profiles
  add column if not exists push_token text;
