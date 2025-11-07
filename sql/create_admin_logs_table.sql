-- Create admin_logs table to persist administrative actions
create table if not exists admin_logs (
  id uuid primary key default uuid_generate_v4(),
  action text not null,
  user_id uuid,
  role text,
  status_code integer,
  duration_ms integer,
  ip_address text,
  created_at timestamptz not null default now(),
  metadata jsonb
);

create index if not exists admin_logs_created_at_idx on admin_logs (created_at desc);
create index if not exists admin_logs_user_idx on admin_logs (user_id);

