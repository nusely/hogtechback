alter table if exists orders
add column if not exists discount_code text;

create index if not exists orders_discount_code_idx on orders (discount_code);

