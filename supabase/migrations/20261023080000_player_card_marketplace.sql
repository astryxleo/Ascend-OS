-- Player card gallery: server-validated ownership and equipped-card export gate.
create table if not exists public.player_card_catalog (
  id text primary key,
  label text not null,
  price_coins integer not null check(price_coins > 0),
  rarity text not null check(rarity in ('Premium','Elite','Legendary','Mythic')),
  theme text not null check(theme in ('gold','cyan','violet','crimson','emerald','obsidian')),
  description text not null,
  display_order integer not null default 0,
  active boolean not null default true
);
create table if not exists public.player_card_owned (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.player_card_catalog(id) on delete restrict,
  purchased_at timestamptz not null default now(),
  primary key(user_id,card_id)
);
create table if not exists public.player_card_equipped (
  user_id uuid primary key references auth.users(id) on delete cascade,
  card_id text not null,
  updated_at timestamptz not null default now()
);
-- Composite ownership FK enforces that an equipped card belongs to that same user.
alter table public.player_card_equipped drop constraint if exists player_card_equipped_user_card_fkey;
alter table public.player_card_equipped add constraint player_card_equipped_user_card_fkey
  foreign key(user_id,card_id) references public.player_card_owned(user_id,card_id) on delete cascade;
alter table public.player_card_catalog enable row level security;
alter table public.player_card_owned enable row level security;
alter table public.player_card_equipped enable row level security;
drop policy if exists "Active player card catalog readable" on public.player_card_catalog;
create policy "Active player card catalog readable" on public.player_card_catalog for select to authenticated using(active);
drop policy if exists "Read own player card inventory" on public.player_card_owned;
create policy "Read own player card inventory" on public.player_card_owned for select to authenticated using(user_id=auth.uid());
drop policy if exists "Read own equipped player card" on public.player_card_equipped;
create policy "Read own equipped player card" on public.player_card_equipped for select to authenticated using(user_id=auth.uid());
grant select on public.player_card_catalog,public.player_card_owned,public.player_card_equipped to authenticated;
revoke all on public.player_card_owned,public.player_card_equipped from anon,public;
insert into public.player_card_catalog(id,label,price_coins,rarity,theme,description,display_order) values
('card:obsidian-elite','Obsidian Elite',25000,'Premium','obsidian','Matte obsidian, titanium trim, quiet prestige',1),
('card:imperial-gold','Imperial Gold',40000,'Elite','gold','Champagne-gold frame with a regal finish',2),
('card:cyber-cyan','Cyber Sovereign',60000,'Elite','cyan','Electric cyan accents and a futuristic grid',3),
('card:royal-violet','Royal Dynasty',85000,'Legendary','violet','Violet crystal highlights and a royal crest',4),
('card:crimson-apex','Crimson Apex',120000,'Legendary','crimson','Crimson energy with an elite battle dossier',5),
('card:evergreen-mythic','Evergreen Mythic',175000,'Mythic','emerald','Emerald lightwork reserved for the highest tier',6)
on conflict(id) do update set label=excluded.label,price_coins=excluded.price_coins,rarity=excluded.rarity,theme=excluded.theme,description=excluded.description,display_order=excluded.display_order,active=true;

create or replace function public.get_player_card_store()
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); cards jsonb; owned jsonb; equipped text; balance bigint:=0;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'price_coins',price_coins,'rarity',rarity,'theme',theme,'description',description,'display_order',display_order) order by price_coins asc,id asc),'[]'::jsonb)
 into cards from public.player_card_catalog where active;
 select coalesce(jsonb_agg(card_id order by card_id),'[]'::jsonb) into owned from public.player_card_owned where user_id=u;
 select card_id into equipped from public.player_card_equipped where user_id=u;
 select coalesce(coins,0) into balance from public.wallets where user_id=u;
 return jsonb_build_object('cards',cards,'owned_card_ids',owned,'equipped_card_id',equipped,'coins',coalesce(balance,0));
end $$;

create or replace function public.purchase_player_card(p_card_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); c public.player_card_catalog%rowtype; balance bigint;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select * into c from public.player_card_catalog where id=p_card_id and active for update;
 if not found then raise exception 'Card is unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('player-card:'||u::text,0));
 if exists(select 1 from public.player_card_owned where user_id=u and card_id=c.id) then raise exception 'You already own this card'; end if;
 select coins into balance from public.wallets where user_id=u for update;
 if not found then raise exception 'Wallet not found'; end if;
 if coalesce(balance,0)<c.price_coins then raise exception 'Not enough coins'; end if;
 update public.wallets set coins=coins-c.price_coins,updated_at=now() where user_id=u returning coins into balance;
 insert into public.player_card_owned(user_id,card_id) values(u,c.id);
 insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',-c.price_coins,'Player card: '||c.label,'player_card_marketplace');
 return jsonb_build_object('success',true,'card_id',c.id,'label',c.label,'price',c.price_coins,'coins',balance);
end $$;

create or replace function public.equip_player_card(p_card_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); c public.player_card_catalog%rowtype;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select * into c from public.player_card_catalog where id=p_card_id and active;
 if not found then raise exception 'Card is unavailable'; end if;
 if not exists(select 1 from public.player_card_owned where user_id=u and card_id=p_card_id) then raise exception 'Purchase this card before equipping it'; end if;
 insert into public.player_card_equipped(user_id,card_id,updated_at) values(u,p_card_id,now())
 on conflict(user_id) do update set card_id=excluded.card_id,updated_at=now();
 return jsonb_build_object('success',true,'equipped_card_id',p_card_id,'label',c.label);
end $$;
revoke all on function public.get_player_card_store() from public,anon;
revoke all on function public.purchase_player_card(text) from public,anon;
revoke all on function public.equip_player_card(text) from public,anon;
grant execute on function public.get_player_card_store() to authenticated;
grant execute on function public.purchase_player_card(text) to authenticated;
grant execute on function public.equip_player_card(text) to authenticated;
