-- Apenas no banco isolado com perfis sintéticos ...001 admin, ...002 supervisor, ...003 controlador.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.save_quality_directory('[{"login":"z_test","full_name":"Técnico de teste","city":"Natal","sector":"VT","supervisor":"A"}]');
do $$ begin
  if not exists(select 1 from public.quality_technician_directory where login='Z_TEST' and city='Natal') then
    raise exception 'Cadastro não salvo';
  end if;
  begin
    perform public.save_quality_directory('[{"login":"ATOMIC","full_name":"Teste"},{"login":"INVALID SPACE","full_name":"Teste"}]');
    raise exception 'Login inválido foi aceito';
  exception when check_violation then null; end;
  if exists(select 1 from public.quality_technician_directory where login='ATOMIC') then
    raise exception 'Lote parcialmente salvo';
  end if;
  begin
    perform public.save_quality_directory(null);
    raise exception 'Lote nulo foi aceito';
  exception when check_violation then null; end;
end $$;
select public.save_quality_directory('[{"login":"Z_TEST","full_name":"Nome atualizado","city":"Recife","sector":"Adesão","supervisor":"B"}]');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if not exists(select 1 from public.quality_technician_directory where login='Z_TEST' and full_name='Nome atualizado') then
    raise exception 'Supervisor não consulta cadastro atualizado';
  end if;
  begin
    perform public.save_quality_directory('[{"login":"Z_TEST","full_name":"Proibido"}]');
    raise exception 'Supervisor alterou cadastro';
  exception when insufficient_privilege then null; end;
  update public.quality_technician_directory set full_name='Proibido',updated_by=auth.uid() where login='Z_TEST';
  if found then raise exception 'Supervisor atualizou diretamente'; end if;
  delete from public.quality_technician_directory where login='Z_TEST';
  if found then raise exception 'Supervisor excluiu diretamente'; end if;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if exists(select 1 from public.quality_technician_directory) then raise exception 'Controlador acessou qualidade'; end if;
  begin
    perform public.save_quality_directory('[{"login":"FORBIDDEN","full_name":"Proibido"}]');
    raise exception 'Controlador cadastrou login';
  exception when insufficient_privilege then null; end;
  if has_table_privilege('anon','public.quality_technician_directory','select')
    or has_function_privilege('anon','public.save_quality_directory(jsonb)','execute') then
    raise exception 'Permissão anônima exposta';
  end if;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
delete from public.quality_technician_directory where login='Z_TEST';
do $$ begin
  if exists(select 1 from public.quality_technician_directory where login='Z_TEST') then raise exception 'Gestor não excluiu cadastro'; end if;
end $$;
rollback;
