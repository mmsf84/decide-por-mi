-- User-isolated Supabase storage for comparisons, products, conversations, and results.
create table public.comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  criteria jsonb not null default '[]'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comparisons_id_user_id_key unique (id, user_id),
  constraint comparisons_criteria_is_array check (jsonb_typeof(criteria) = 'array'),
  constraint comparisons_analysis_is_object check (jsonb_typeof(analysis) = 'object')
);

create table public.comparison_products (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  name text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint comparison_products_comparison_user_fkey
    foreign key (comparison_id, user_id)
    references public.comparisons (id, user_id)
    on delete cascade
);

create table public.comparison_messages (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint comparison_messages_role_check check (role in ('user', 'assistant')),
  constraint comparison_messages_comparison_user_fkey
    foreign key (comparison_id, user_id)
    references public.comparisons (id, user_id)
    on delete cascade
);

create index comparisons_user_id_idx on public.comparisons (user_id);
create index comparisons_created_at_idx on public.comparisons (created_at desc);
create index comparison_products_user_id_idx on public.comparison_products (user_id);
create index comparison_products_comparison_user_id_idx on public.comparison_products (comparison_id, user_id);
create index comparison_messages_user_id_idx on public.comparison_messages (user_id);
create index comparison_messages_comparison_user_id_created_at_idx
  on public.comparison_messages (comparison_id, user_id, created_at);

grant select, insert, update, delete on public.comparisons to authenticated;
grant select, insert, update, delete on public.comparison_products to authenticated;
grant select, insert, update, delete on public.comparison_messages to authenticated;

alter table public.comparisons enable row level security;
alter table public.comparison_products enable row level security;
alter table public.comparison_messages enable row level security;

create policy "Users can read their own comparisons"
  on public.comparisons for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own comparisons"
  on public.comparisons for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own comparisons"
  on public.comparisons for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own comparisons"
  on public.comparisons for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own comparison products"
  on public.comparison_products for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own comparison products"
  on public.comparison_products for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own comparison products"
  on public.comparison_products for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own comparison products"
  on public.comparison_products for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own comparison messages"
  on public.comparison_messages for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own comparison messages"
  on public.comparison_messages for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own comparison messages"
  on public.comparison_messages for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own comparison messages"
  on public.comparison_messages for delete to authenticated
  using ((select auth.uid()) = user_id);
