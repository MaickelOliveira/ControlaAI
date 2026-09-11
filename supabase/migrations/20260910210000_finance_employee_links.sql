-- Relaciona despesas/pagamentos à ficha do funcionário. O lançamento em
-- Finanças permanece como fonte de verdade e o histórico do colaborador é
-- derivado deste vínculo. Ao excluir/desativar funcionário, o histórico
-- financeiro nunca é apagado.
alter table public.finances
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create index if not exists finances_employee_idx on public.finances(employee_id);

-- Mantém o vínculo nos pagamentos recorrentes para que, ao confirmar cada
-- salário, o lançamento gerado apareça automaticamente na ficha correta.
alter table public.recurring_transactions
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create index if not exists recurring_employee_idx on public.recurring_transactions(employee_id);
