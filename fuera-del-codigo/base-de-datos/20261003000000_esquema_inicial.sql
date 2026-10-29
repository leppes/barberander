-- =====================================================================
-- Xander Home · esquema inicial del sistema de reservas
-- =====================================================================

-- Permite la regla "no pueden existir dos reservas que se crucen"
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

-- Configuración general (una sola fila)
create table public.settings (
  id boolean primary key default true check (id),
  timezone text not null default 'America/Santiago',
  slot_step_min int not null default 15 check (slot_step_min between 5 and 120),   -- cada cuánto se ofrecen horas
  buffer_min int not null default 10 check (buffer_min between 0 and 120),         -- descanso entre clientes
  max_days_ahead int not null default 30 check (max_days_ahead between 1 and 365), -- hasta cuántos días adelante
  min_notice_min int not null default 60 check (min_notice_min >= 0),              -- anticipación mínima
  cancel_limit_min int not null default 180 check (cancel_limit_min >= 0),         -- cancelar hasta X min antes
  max_active_per_phone int not null default 2 check (max_active_per_phone >= 1)    -- anti-spam
);

create table public.barbers (
  id smallint generated always as identity primary key,
  name text not null,
  active boolean not null default true
);

create table public.services (
  id smallint generated always as identity primary key,
  name text not null,
  duration_min int not null check (duration_min > 0),
  price int not null check (price >= 0),
  featured boolean not null default false,
  sort int not null default 0,
  active boolean not null default true
);

-- Horario de atención. Un día puede tener varios tramos (ej. pausa de almuerzo)
create table public.working_hours (
  id bigint generated always as identity primary key,
  barber_id smallint not null references public.barbers on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens time not null,
  closes time not null,
  check (closes > opens)
);

-- Bloqueos: vacaciones, trámites, horas tomadas por fuera del sistema
create table public.time_off (
  id bigint generated always as identity primary key,
  barber_id smallint not null references public.barbers on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  barber_id smallint not null references public.barbers,
  service_id smallint not null references public.services,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_until timestamptz not null, -- ends_at + descanso
  customer_name text not null check (char_length(customer_name) between 2 and 80),
  customer_phone text not null check (customer_phone ~ '^\+?[0-9]{8,15}$'),
  customer_email text check (customer_email is null or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  price int not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  cancel_token uuid not null unique default gen_random_uuid(),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- La base de datos misma impide dos reservas cruzadas para el mismo barbero
  constraint bookings_no_overlap exclude using gist (
    barber_id with =,
    tstzrange(starts_at, block_until) with &&
  ) where (status = 'confirmed')
);
create index bookings_starts_at_idx on public.bookings (starts_at);
create index bookings_phone_idx on public.bookings (customer_phone);

-- Usuarios con acceso al panel (Anderson)
create table public.admins (
  user_id uuid primary key references auth.users on delete cascade
);

-- ---------------------------------------------------------------------
-- Seguridad (RLS): el público solo ve el catálogo; las reservas, solo admins
-- ---------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Permisos explícitos (el proyecto no expone tablas automáticamente)
grant usage on schema public to anon, authenticated;
grant select on public.settings, public.barbers, public.services, public.working_hours to anon, authenticated;
grant select, insert, update, delete on
  public.settings, public.barbers, public.services, public.working_hours, public.time_off, public.bookings
  to authenticated;
grant select on public.admins to authenticated;
grant usage on all sequences in schema public to authenticated;

alter table public.settings      enable row level security;
alter table public.barbers       enable row level security;
alter table public.services      enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off      enable row level security;
alter table public.bookings      enable row level security;
alter table public.admins        enable row level security;

create policy "catalogo publico" on public.settings      for select to anon, authenticated using (true);
create policy "catalogo publico" on public.barbers       for select to anon, authenticated using (active or public.is_admin());
create policy "catalogo publico" on public.services      for select to anon, authenticated using (active or public.is_admin());
create policy "catalogo publico" on public.working_hours for select to anon, authenticated using (true);

create policy "admin todo" on public.settings      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin todo" on public.barbers       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin todo" on public.services      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin todo" on public.working_hours for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin todo" on public.time_off      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin todo" on public.bookings      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ver mi rol" on public.admins        for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Funciones públicas (lo único que el cliente puede ejecutar)
-- ---------------------------------------------------------------------

-- Horas libres para un servicio en un día
create function public.available_slots(p_service_id smallint, p_date date, p_barber_id smallint default null)
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

-- Días que tienen al menos una hora libre (para pintar el calendario)
create function public.available_dates(p_service_id smallint, p_barber_id smallint default null)
returns setof date
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.settings;
  v_today date;
  d date;
begin
  select * into s from public.settings;
  v_today := (now() at time zone s.timezone)::date;
  for d in select generate_series(v_today, v_today + s.max_days_ahead, interval '1 day')::date loop
    if exists (select 1 from public.available_slots(p_service_id, d, p_barber_id)) then
      return next d;
    end if;
  end loop;
end;
$$;

-- Crear reserva (vuelve a validar que la hora siga libre)
create function public.create_booking(
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
  select * into v_service from public.services where services.id = p_service_id and active;
  if not found then raise exception 'Servicio no disponible'; end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');

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

-- Ver una reserva con su link secreto
create function public.get_booking(p_token uuid)
returns table (id uuid, starts_at timestamptz, service_name text, barber_name text, price int,
               customer_name text, status text, can_cancel boolean)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.starts_at, sv.name, br.name, b.price, b.customer_name, b.status,
         b.status = 'confirmed'
           and b.starts_at - now() >= make_interval(mins => (select cancel_limit_min from public.settings))
  from public.bookings b
  join public.services sv on sv.id = b.service_id
  join public.barbers br on br.id = b.barber_id
  where b.cancel_token = p_token;
$$;

-- Cancelar con el link secreto
create function public.cancel_booking(p_token uuid)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_limit int;
begin
  select cancel_limit_min into v_limit from public.settings;
  update public.bookings
     set status = 'cancelled', cancelled_at = now()
   where cancel_token = p_token
     and status = 'confirmed'
     and starts_at - now() >= make_interval(mins => v_limit);
  if not found then
    raise exception 'No se puede cancelar: ya pasó el plazo o la reserva no existe';
  end if;
  return true;
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.available_slots(smallint, date, smallint) to anon, authenticated;
grant execute on function public.available_dates(smallint, smallint) to anon, authenticated;
grant execute on function public.create_booking(smallint, timestamptz, text, text, text, smallint) to anon, authenticated;
grant execute on function public.get_booking(uuid) to anon, authenticated;
grant execute on function public.cancel_booking(uuid) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated; -- lo usan las políticas; para anon siempre es false

-- ---------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------

insert into public.settings default values;

insert into public.barbers (name) values ('Anderson Muñoz');

insert into public.services (name, duration_min, price, featured, sort) values
  ('Corte de Cabello',      45, 12000, false, 1),
  ('Barba',                 45, 10000, false, 2),
  ('Corte + Cejas',         60, 14000, false, 3),
  ('Corte + Barba',         90, 20000, true,  4),
  ('Corte + Barba + Cejas', 90, 22000, false, 5);

-- Horario provisorio (el de Setmore). Se cambia desde el panel.
insert into public.working_hours (barber_id, weekday, opens, closes)
select 1, d, time '11:00', time '20:00' from generate_series(1, 5) d
union all
select 1, 6, time '10:00', time '20:00';
