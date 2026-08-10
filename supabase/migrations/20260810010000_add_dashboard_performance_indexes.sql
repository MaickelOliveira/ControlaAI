-- Índices usados nas consultas de navegação do dashboard.
create index if not exists finances_user_mode_date_idx
  on finances(user_id, mode, date);

create index if not exists tasks_user_mode_status_idx
  on tasks(user_id, mode, status);
