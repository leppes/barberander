-- =====================================================================
-- Xander Home · personalización completa desde el panel
-- =====================================================================

-- 1) Contenido editable de la página (textos, fotos, colores) en una sola fila
create table public.site (
  id boolean primary key default true check (id),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.site default values;

grant select on public.site to anon, authenticated;
grant update on public.site to authenticated;
alter table public.site enable row level security;
create policy "contenido publico" on public.site for select to anon, authenticated using (true);
create policy "admin edita" on public.site for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 2) Interruptor para pausar las reservas online
alter table public.settings add column booking_enabled boolean not null default true;

-- 3) Horas cada 1 hora; el espacio entre horas ya sirve de descanso
update public.settings set slot_step_min = 60, buffer_min = 0;

-- 4) Lunes a sábado de 10:00 a 21:00 (se cambia desde el panel)
delete from public.working_hours;
insert into public.working_hours (barber_id, weekday, opens, closes)
select b.id, d, time '10:00', time '21:00'
from (select min(id) as id from public.barbers) b
cross join generate_series(1, 6) d;

-- 5) Las reservas que Anderson agrega a mano pueden no tener teléfono
alter table public.bookings alter column customer_phone drop not null;

-- 6) Horas libres: ahora respetan el interruptor de reservas online
create or replace function public.available_slots(p_service_id smallint, p_date date, p_barber_id smallint default null)
returns table (barber_id smallint, starts_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.settings;
  v_duration int;
  v_today date;
begin
  select * into s from public.settings;
  if not s.booking_enabled then return; end if;

  select duration_min into v_duration from public.services where id = p_service_id and active;
  if v_duration is null then return; end if;

  v_today := (now() at time zone s.timezone)::date;
  if p_date < v_today or p_date > v_today + s.max_days_ahead then return; end if;

  return query
  select wh.barber_id, slot.ts
  from public.working_hours wh
  join public.barbers b on b.id = wh.barber_id and b.active
  cross join lateral generate_series(
    p_date + wh.opens,
    p_date + wh.closes - make_interval(mins => v_duration),
    make_interval(mins => s.slot_step_min)
  ) as g(local_ts)
  cross join lateral (select g.local_ts at time zone s.timezone as ts) slot
  where wh.weekday = extract(dow from p_date)
    and (p_barber_id is null or wh.barber_id = p_barber_id)
    and slot.ts >= now() + make_interval(mins => s.min_notice_min)
    and not exists (
      select 1 from public.bookings bk
      where bk.barber_id = wh.barber_id
        and bk.status = 'confirmed'
        and tstzrange(bk.starts_at, bk.block_until)
            && tstzrange(slot.ts, slot.ts + make_interval(mins => v_duration + s.buffer_min))
    )
    and not exists (
      select 1 from public.time_off o
      where o.barber_id = wh.barber_id
        and tstzrange(o.starts_at, o.ends_at)
            && tstzrange(slot.ts, slot.ts + make_interval(mins => v_duration))
    )
  order by slot.ts, wh.barber_id;
end;
$$;

-- 7) Crear reserva: respeta el interruptor y valida nombre y teléfono con mensajes claros
create or replace function public.create_booking(
  p_service_id smallint,
  p_starts_at timestamptz,
  p_name text,
  p_phone text,
  p_email text default null,
  p_barber_id smallint default null
)
returns table (id uuid, cancel_token uuid, starts_at timestamptz, service_name text, barber_name text, price int)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.settings;
  v_service public.services;
  v_barber smallint;
  v_phone text;
  v_id uuid;
  v_token uuid;
begin
  select * into s from public.settings;
  if not s.booking_enabled then
    raise exception 'Las reservas online están pausadas. Escríbenos por WhatsApp.';
  end if;

  select * into v_service from public.services where services.id = p_service_id and active;
  if not found then raise exception 'Servicio no disponible'; end if;

  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Escribe tu nombre.'; end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'Revisa tu número de teléfono.'; end if;

  select a.barber_id into v_barber
  from public.available_slots(p_service_id, (p_starts_at at time zone s.timezone)::date, p_barber_id) a
  where a.starts_at = p_starts_at
  limit 1;
  if v_barber is null then raise exception 'Esa hora ya no está disponible'; end if;

  if (select count(*) from public.bookings b
      where b.customer_phone = v_phone and b.status = 'confirmed' and b.starts_at > now()) >= s.max_active_per_phone then
    raise exception 'Ya tienes % horas reservadas. Cancela una para tomar otra.', s.max_active_per_phone;
  end if;

  insert into public.bookings
    (barber_id, service_id, starts_at, ends_at, block_until, customer_name, customer_phone, customer_email, price)
  values (
    v_barber, p_service_id, p_starts_at,
    p_starts_at + make_interval(mins => v_service.duration_min),
    p_starts_at + make_interval(mins => v_service.duration_min + s.buffer_min),
    trim(p_name), v_phone, nullif(lower(trim(coalesce(p_email, ''))), ''), v_service.price
  )
  returning bookings.id, bookings.cancel_token into v_id, v_token;

  return query
  select v_id, v_token, p_starts_at, v_service.name,
         (select br.name from public.barbers br where br.id = v_barber), v_service.price;
exception
  when exclusion_violation then raise exception 'Esa hora ya no está disponible';
end;
$$;

-- 8) Guardar el horario completo de una sola vez (solo admin).
--    Si algo falla no se borra nada: o se guarda todo o nada.
create function public.admin_set_hours(p_hours jsonb, p_barber_id smallint default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_barber smallint;
begin
  if not public.is_admin() then raise exception 'Sin permiso'; end if;
  v_barber := coalesce(p_barber_id, (select min(id) from public.barbers));

  delete from public.working_hours where barber_id = v_barber;
  insert into public.working_hours (barber_id, weekday, opens, closes)
  select v_barber, (h->>'weekday')::smallint, (h->>'opens')::time, (h->>'closes')::time
  from jsonb_array_elements(p_hours) h;
end;
$$;
revoke execute on function public.admin_set_hours(jsonb, smallint) from public, anon;
grant execute on function public.admin_set_hours(jsonb, smallint) to authenticated;

-- 9) Fotos que se suben desde el panel (portada, barbero, galería)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admin ve fotos" on storage.objects for select to authenticated
  using (bucket_id = 'site' and public.is_admin());
create policy "admin sube fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.is_admin());
create policy "admin cambia fotos" on storage.objects for update to authenticated
  using (bucket_id = 'site' and public.is_admin());
create policy "admin borra fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.is_admin());
