create index if not exists restock_request_events_actor_user_id_idx on public.restock_request_events (actor_user_id);
create index if not exists restock_requests_location_id_idx on public.restock_requests (location_id);
;
