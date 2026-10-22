create table if not exists public.combat_customizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_color text not null default 'crimson' check (team_color in ('crimson','cyan','gold','violet','emerald')),
  helmet text not null default 'ronin' check (helmet in ('none','ronin','tactical','horned')),
  visor text not null default 'glow' check (visor in ('glow','slit','cross','none')),
  armor_style text not null default 'light' check (armor_style in ('light','ronin','heavy','tech')),
  weapon_skin text not null default 'energy' check (weapon_skin in ('energy','steel','void','plasma')),
  pose text not null default 'ready' check (pose in ('ready','guard','agile','power')),
  aura boolean not null default true,
  squad_name text not null default 'Obsidian Unit' check (char_length(squad_name) between 1 and 24),
  squad_emblem text not null default 'phoenix' check (squad_emblem in ('phoenix','wolf','crown','comet','shield')),
  formation text not null default 'wedge' check (formation in ('line','v_shape','wedge','circle')),
  vanguard_role text not null default 'Vanguard' check (vanguard_role in ('Vanguard','Defender','Scout','Support','Striker','Medic','Ranger')),
  defender_role text not null default 'Defender' check (defender_role in ('Vanguard','Defender','Scout','Support','Striker','Medic','Ranger')),
  scout_role text not null default 'Scout' check (scout_role in ('Vanguard','Defender','Scout','Support','Striker','Medic','Ranger')),
  support_role text not null default 'Support' check (support_role in ('Vanguard','Defender','Scout','Support','Striker','Medic','Ranger')),
  updated_at timestamptz not null default now()
);
alter table public.combat_customizations enable row level security;
drop policy if exists "Users can read own combat customization" on public.combat_customizations;
create policy "Users can read own combat customization" on public.combat_customizations for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create own combat customization" on public.combat_customizations;
create policy "Users can create own combat customization" on public.combat_customizations for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own combat customization" on public.combat_customizations;
create policy "Users can update own combat customization" on public.combat_customizations for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.combat_customizations to authenticated;
revoke all on public.combat_customizations from anon;