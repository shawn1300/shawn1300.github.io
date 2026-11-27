begin;

create table public.burn_messages (
  token_digest text primary key check (token_digest ~ '^[0-9a-f]{64}$'),
  ciphertext text not null
    check (length(ciphertext) between 23 and 21867 and ciphertext ~ '^[A-Za-z0-9_-]+$'),
  iv text not null check (iv ~ '^[A-Za-z0-9_-]{16}$'),
  expires_at timestamptz not null
);

create index burn_messages_expires_at_idx on public.burn_messages (expires_at);

alter table public.burn_messages enable row level security;
revoke all privileges on table public.burn_messages from public, anon, authenticated, service_role;
grant select, insert, delete on table public.burn_messages to service_role;

create function public.create_burn_message(
  p_token_digest text,
  p_ciphertext text,
  p_iv text,
  p_expiry text
)
returns timestamptz
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.burn_messages (token_digest, ciphertext, iv, expires_at)
  values (
    p_token_digest,
    p_ciphertext,
    p_iv,
    statement_timestamp() + case p_expiry
      when '1h' then interval '1 hour'
      when '24h' then interval '24 hours'
      when '7d' then interval '168 hours'
    end
  )
  returning expires_at;
$$;

create function public.claim_burn_message(p_token_digest text)
returns table (ciphertext text, iv text)
language sql
volatile
security invoker
set search_path = ''
as $$
  delete from public.burn_messages as message
  where message.token_digest = p_token_digest
    and message.expires_at > statement_timestamp()
  returning message.ciphertext, message.iv;
$$;

create function public.purge_expired_burn_messages()
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  delete from public.burn_messages
  where expires_at <= statement_timestamp();
$$;

revoke all privileges on function public.create_burn_message(text, text, text, text)
  from public, anon, authenticated;
revoke all privileges on function public.claim_burn_message(text)
  from public, anon, authenticated;
revoke all privileges on function public.purge_expired_burn_messages()
  from public, anon, authenticated;

grant execute on function public.create_burn_message(text, text, text, text) to service_role;
grant execute on function public.claim_burn_message(text) to service_role;
grant execute on function public.purge_expired_burn_messages() to service_role;

commit;
