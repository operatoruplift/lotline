-- Run as a database administrator against a migrated development project.
-- Every fixture, including synthetic auth users, is rolled back. No email is sent.
begin;
insert into auth.users (id, aud, role, email) values
  ('a10c4992-7137-42e4-9391-b43334420201', 'authenticated', 'authenticated', 'lotline-rls-a@example.invalid'),
  ('b20c4992-7137-42e4-9391-b43334420202', 'authenticated', 'authenticated', 'lotline-rls-b@example.invalid');

do $$ begin
  if has_table_privilege('anon', 'public.lotline_contribution_plans', 'select') then raise exception 'Anonymous SELECT must be denied'; end if;
  if has_table_privilege('anon', 'public.lotline_contribution_plans', 'insert') then raise exception 'Anonymous INSERT must be denied'; end if;
  if has_table_privilege('authenticated', 'public.lotline_contribution_plans', 'update') then raise exception 'UPDATE must be denied'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'a10c4992-7137-42e4-9391-b43334420201';
insert into public.lotline_contribution_plans (id, user_id, name, budget_raw, allocations)
values ('a30c4992-7137-42e4-9391-b43334420203', auth.uid(), 'Owner A', '10000001', '[{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":"10000"}]');

set local request.jwt.claim.sub = 'b20c4992-7137-42e4-9391-b43334420202';
insert into public.lotline_contribution_plans (id, user_id, name, budget_raw, allocations)
values ('b40c4992-7137-42e4-9391-b43334420204', auth.uid(), 'Owner B', '20000001', '[{"mint":"XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX","bps":"10000"}]');

set local request.jwt.claim.sub = 'a10c4992-7137-42e4-9391-b43334420201';
do $$
declare affected integer; blocked boolean := false;
begin
  if (select count(*) from public.lotline_contribution_plans) <> 1 then raise exception 'Cross-user rows are visible'; end if;
  if (select budget_raw from public.lotline_contribution_plans) <> '10000001' then raise exception 'Micro-USDC was not retained'; end if;
  delete from public.lotline_contribution_plans where id = 'b40c4992-7137-42e4-9391-b43334420204';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-user DELETE succeeded'; end if;
  begin
    insert into public.lotline_contribution_plans (user_id, name, budget_raw, allocations)
    values ('b20c4992-7137-42e4-9391-b43334420202', 'Spoofed owner', '1', '[{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":"10000"}]');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Cross-user INSERT succeeded'; end if;
end $$;

do $$
declare payload jsonb; blocked boolean;
begin
  for payload in select value from jsonb_array_elements('[
    [{"mint":"11111111111111111111111111111111","bps":"10000"}],
    [{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":"10000","wallet":"forbidden"}],
    [{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":"5000"},{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":"5000"}],
    [{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":10000}],
    [{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":"9999"}],
    []
  ]') loop
    blocked := false;
    begin
      insert into public.lotline_contribution_plans (user_id, name, budget_raw, allocations) values (auth.uid(), 'Invalid split', '1', payload);
    exception when check_violation then blocked := true;
    end;
    if not blocked then raise exception 'Malformed plan passed database validation: %', payload; end if;
  end loop;
end $$;

do $$
declare budget text; blocked boolean;
begin
  foreach budget in array array['0','-1','1.0','1e6','0100','1000000000001','not a number'] loop
    blocked := false;
    begin
      insert into public.lotline_contribution_plans (user_id, name, budget_raw, allocations)
      values (auth.uid(), 'Invalid budget', budget, '[{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":"10000"}]');
    exception when check_violation then blocked := true;
    end;
    if not blocked then raise exception 'Malformed budget passed database validation: %', budget; end if;
  end loop;
end $$;

do $$
declare i integer; blocked boolean := false;
begin
  for i in 1..19 loop
    insert into public.lotline_contribution_plans (user_id, name, budget_raw, allocations)
    values (auth.uid(), 'Limit check ' || i, '1', '[{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":"10000"}]');
  end loop;
  begin
    insert into public.lotline_contribution_plans (user_id, name, budget_raw, allocations)
    values (auth.uid(), 'Must fail at 21', '1', '[{"mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp","bps":"10000"}]');
  exception when raise_exception then blocked := true;
  end;
  if not blocked then raise exception '20-plan account limit was bypassed'; end if;
  delete from public.lotline_contribution_plans where id = 'a30c4992-7137-42e4-9391-b43334420203';
  if (select count(*) from public.lotline_contribution_plans) <> 19 then raise exception 'Own DELETE failed'; end if;
end $$;

set local request.jwt.claim.sub = '';
do $$ begin
  if (select count(*) from public.lotline_contribution_plans) <> 0 then raise exception 'Missing identity exposed rows'; end if;
end $$;
reset role;
rollback;
select 'PASS: grants, ownership RLS, exact amounts, split validation, limits, and delete isolation; all fixtures rolled back' as result;
