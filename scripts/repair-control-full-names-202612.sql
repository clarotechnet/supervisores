-- Correção de identificação, solicitada pela gestão, para as mesmas 42 pessoas.
-- Somente Controle RN / dezembro 2026 / aba oficial já vinculada.
-- Não altera dias, funções, logins, quantitativos, status de aprovação ou o Sheets.
-- A transação guarda a fotografia anterior em schedule_generation_events.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $repair$
declare
  v_sheet public.schedule_operational_sheets%rowtype;
  v_draft public.schedule_generation_drafts%rowtype;
  v_official public.schedule_uploads%rowtype;
  v_actor uuid := '70706dfe-3d8b-4b0e-a462-bde95903ec95';
  v_names jsonb := $names${"ANTONIA ELIZIENE": "ANTONIA ELIZIENE DO NASCIMENTO", "RENAN PAIVA": "RENAN PAIVA DE MENDONCA ALVES", "ROSA FERNANDA": "ROSA FERNANDA FERREIRA SILVA DE BRITO", "ANDERSON JUSSIER": "ANDERSON JUSSIER DA SILVA FERNANDES", "KENIA KATIUCIA": "KENIA KATIUCIA SANTOS DA SILVA", "ANA PATRICIA": "ANA PATRICIA RODRIGUES ALVES SILVA", "DARLANNY FERNANDES": "DARLLANYDIERY SOUZA FERNANDES DE LEMOS", "KARLLA RAYANE": "KARLLA RAYANE VIRGINIO DE OLIVEIRA", "RUDSON JOAN": "RUDSON JOAN AMORIM DA SILVA", "YURI ALVES": "YURI ALVES DA SILVA SOUZA", "MARIA FRANÇOELLI": "MARIA FRANCOELLI ALVES DO NASCIMENTO", "ANA KAROLINE": "ANA KAROLINE XAVIER MONTEIRO", "BRUNA BEATRIZ": "BRUNA BEATRIZ LOPES DE OLIVEIRA", "JOAO DANIEL": "JOAO DANIEL JERONIMO DE ALMEIDA", "CLAYTON SOUTO": "CLAYTON SOUTO DE OLIVEIRA", "DAVID DA SILVA": "DAVID DA SILVA SALES", "JEFFERSON FIRMINO": "JEFFERSON FIRMINO DA SILVA", "YURI RAFAEL": "YURI RAFAEL SANTOS DE ARAUJO", "MARCELLE DIANNE": "MARCELLE DIANNE ARAUJO MARTINS", "KLEYTON BRUNO": "KLEYTON BRUNO FERREIRA DAMASCENO", "DALTON SYMEY": "DALTON SYMEY GODOI FONSECA", "MATHEUS FREITAS": "MATHEUS FREITAS DIONISIO CAMARA", "FELIPE MATEUS": "FELIPE MATEUS MEDEIROS DE LUCENA", "WELTON": "WELTON MARQUES FERREIRA", "HERYSON SCOTT": "HERYSON SCOTT DE OLIVEIRA SILVA", "ROMUALDO SANTOS": "ROMUALDO SANTOS DE MELO", "JOSE VICTOR": "JOSE VICTOR DO NASCIMENTO FILGUEIRA", "STUART ARAUJO": "STUART ARAUJO LEMOS", "EVANIO": "EVANIO DA SILVA OLIVEIRA", "MARTA MARIA": "MARTA MARIA ALBUQUERQUE DO NASCIMENTO", "ROBSON CARLOS": "ROBSON CARLOS FIGUEIREDO", "OYAMA EDUARDO": "OYAMA EDUARDO FILGUEIRA AFONSO JUNIOR", "CLAYVERTON SOUTO": "CLAYVERTON SOUTO DE OLIVEIRA", "ALEX CAMPOS": "ALEX DA COSTA CAMPOS", "TIAGO JANUARIO": "TIAGO DA SILVA JANUARIO", "JEFERSON FERREIRA": "JEFFERSON FERREIRA BARBOSA", "JOSUE MOURA": "JOSUE MOURA DA SILVA", "JUDSON BERTO": "JUDSON BERTO DA SILVA", "VICTOR HUGO": "VICTOR HUGO CUNHA SILVA", "WELLINGTON RAFAEL": "WELLINGTON RAFAEL DE OLIVEIRA", "RODRIGO PESSOA": "RODRIGO RAMON PESSOA CRUZ", "CARLOS ADRIANO": "CARLOS ADRIANO DA SILVA"}$names$::jsonb;
  v_variants jsonb := $variants${"ANTONIA ELIZIENE": "ANTONIA ELIZIENE DO NASCIMENTO", "NOME:ANTONIA ELIZIENE": "NOME:ANTONIA ELIZIENE DO NASCIMENTO", "RENAN PAIVA": "RENAN PAIVA DE MENDONCA ALVES", "NOME:RENAN PAIVA": "NOME:RENAN PAIVA DE MENDONCA ALVES", "ROSA FERNANDA": "ROSA FERNANDA FERREIRA SILVA DE BRITO", "NOME:ROSA FERNANDA": "NOME:ROSA FERNANDA FERREIRA SILVA DE BRITO", "ANDERSON JUSSIER": "ANDERSON JUSSIER DA SILVA FERNANDES", "NOME:ANDERSON JUSSIER": "NOME:ANDERSON JUSSIER DA SILVA FERNANDES", "KENIA KATIUCIA": "KENIA KATIUCIA SANTOS DA SILVA", "NOME:KENIA KATIUCIA": "NOME:KENIA KATIUCIA SANTOS DA SILVA", "ANA PATRICIA": "ANA PATRICIA RODRIGUES ALVES SILVA", "NOME:ANA PATRICIA": "NOME:ANA PATRICIA RODRIGUES ALVES SILVA", "DARLANNY FERNANDES": "DARLLANYDIERY SOUZA FERNANDES DE LEMOS", "NOME:DARLANNY FERNANDES": "NOME:DARLLANYDIERY SOUZA FERNANDES DE LEMOS", "KARLLA RAYANE": "KARLLA RAYANE VIRGINIO DE OLIVEIRA", "NOME:KARLLA RAYANE": "NOME:KARLLA RAYANE VIRGINIO DE OLIVEIRA", "RUDSON JOAN": "RUDSON JOAN AMORIM DA SILVA", "NOME:RUDSON JOAN": "NOME:RUDSON JOAN AMORIM DA SILVA", "YURI ALVES": "YURI ALVES DA SILVA SOUZA", "NOME:YURI ALVES": "NOME:YURI ALVES DA SILVA SOUZA", "MARIA FRANÇOELLI": "MARIA FRANCOELLI ALVES DO NASCIMENTO", "MARIA FRANCOELLI": "MARIA FRANCOELLI ALVES DO NASCIMENTO", "NOME:MARIA FRANCOELLI": "NOME:MARIA FRANCOELLI ALVES DO NASCIMENTO", "ANA KAROLINE": "ANA KAROLINE XAVIER MONTEIRO", "NOME:ANA KAROLINE": "NOME:ANA KAROLINE XAVIER MONTEIRO", "BRUNA BEATRIZ": "BRUNA BEATRIZ LOPES DE OLIVEIRA", "NOME:BRUNA BEATRIZ": "NOME:BRUNA BEATRIZ LOPES DE OLIVEIRA", "JOAO DANIEL": "JOAO DANIEL JERONIMO DE ALMEIDA", "NOME:JOAO DANIEL": "NOME:JOAO DANIEL JERONIMO DE ALMEIDA", "CLAYTON SOUTO": "CLAYTON SOUTO DE OLIVEIRA", "NOME:CLAYTON SOUTO": "NOME:CLAYTON SOUTO DE OLIVEIRA", "DAVID DA SILVA": "DAVID DA SILVA SALES", "NOME:DAVID DA SILVA": "NOME:DAVID DA SILVA SALES", "JEFFERSON FIRMINO": "JEFFERSON FIRMINO DA SILVA", "NOME:JEFFERSON FIRMINO": "NOME:JEFFERSON FIRMINO DA SILVA", "YURI RAFAEL": "YURI RAFAEL SANTOS DE ARAUJO", "NOME:YURI RAFAEL": "NOME:YURI RAFAEL SANTOS DE ARAUJO", "MARCELLE DIANNE": "MARCELLE DIANNE ARAUJO MARTINS", "NOME:MARCELLE DIANNE": "NOME:MARCELLE DIANNE ARAUJO MARTINS", "KLEYTON BRUNO": "KLEYTON BRUNO FERREIRA DAMASCENO", "NOME:KLEYTON BRUNO": "NOME:KLEYTON BRUNO FERREIRA DAMASCENO", "DALTON SYMEY": "DALTON SYMEY GODOI FONSECA", "NOME:DALTON SYMEY": "NOME:DALTON SYMEY GODOI FONSECA", "MATHEUS FREITAS": "MATHEUS FREITAS DIONISIO CAMARA", "NOME:MATHEUS FREITAS": "NOME:MATHEUS FREITAS DIONISIO CAMARA", "FELIPE MATEUS": "FELIPE MATEUS MEDEIROS DE LUCENA", "NOME:FELIPE MATEUS": "NOME:FELIPE MATEUS MEDEIROS DE LUCENA", "WELTON": "WELTON MARQUES FERREIRA", "NOME:WELTON": "NOME:WELTON MARQUES FERREIRA", "HERYSON SCOTT": "HERYSON SCOTT DE OLIVEIRA SILVA", "NOME:HERYSON SCOTT": "NOME:HERYSON SCOTT DE OLIVEIRA SILVA", "ROMUALDO SANTOS": "ROMUALDO SANTOS DE MELO", "NOME:ROMUALDO SANTOS": "NOME:ROMUALDO SANTOS DE MELO", "JOSE VICTOR": "JOSE VICTOR DO NASCIMENTO FILGUEIRA", "NOME:JOSE VICTOR": "NOME:JOSE VICTOR DO NASCIMENTO FILGUEIRA", "STUART ARAUJO": "STUART ARAUJO LEMOS", "NOME:STUART ARAUJO": "NOME:STUART ARAUJO LEMOS", "EVANIO": "EVANIO DA SILVA OLIVEIRA", "NOME:EVANIO": "NOME:EVANIO DA SILVA OLIVEIRA", "MARTA MARIA": "MARTA MARIA ALBUQUERQUE DO NASCIMENTO", "NOME:MARTA MARIA": "NOME:MARTA MARIA ALBUQUERQUE DO NASCIMENTO", "ROBSON CARLOS": "ROBSON CARLOS FIGUEIREDO", "NOME:ROBSON CARLOS": "NOME:ROBSON CARLOS FIGUEIREDO", "OYAMA EDUARDO": "OYAMA EDUARDO FILGUEIRA AFONSO JUNIOR", "NOME:OYAMA EDUARDO": "NOME:OYAMA EDUARDO FILGUEIRA AFONSO JUNIOR", "CLAYVERTON SOUTO": "CLAYVERTON SOUTO DE OLIVEIRA", "NOME:CLAYVERTON SOUTO": "NOME:CLAYVERTON SOUTO DE OLIVEIRA", "ALEX CAMPOS": "ALEX DA COSTA CAMPOS", "NOME:ALEX CAMPOS": "NOME:ALEX DA COSTA CAMPOS", "TIAGO JANUARIO": "TIAGO DA SILVA JANUARIO", "NOME:TIAGO JANUARIO": "NOME:TIAGO DA SILVA JANUARIO", "JEFERSON FERREIRA": "JEFFERSON FERREIRA BARBOSA", "NOME:JEFERSON FERREIRA": "NOME:JEFFERSON FERREIRA BARBOSA", "JOSUE MOURA": "JOSUE MOURA DA SILVA", "NOME:JOSUE MOURA": "NOME:JOSUE MOURA DA SILVA", "JUDSON BERTO": "JUDSON BERTO DA SILVA", "NOME:JUDSON BERTO": "NOME:JUDSON BERTO DA SILVA", "VICTOR HUGO": "VICTOR HUGO CUNHA SILVA", "NOME:VICTOR HUGO": "NOME:VICTOR HUGO CUNHA SILVA", "WELLINGTON RAFAEL": "WELLINGTON RAFAEL DE OLIVEIRA", "NOME:WELLINGTON RAFAEL": "NOME:WELLINGTON RAFAEL DE OLIVEIRA", "RODRIGO PESSOA": "RODRIGO RAMON PESSOA CRUZ", "NOME:RODRIGO PESSOA": "NOME:RODRIGO RAMON PESSOA CRUZ", "CARLOS ADRIANO": "CARLOS ADRIANO DA SILVA", "NOME:CARLOS ADRIANO": "NOME:CARLOS ADRIANO DA SILVA"}$variants$::jsonb;
  v_before jsonb;
  v_docs jsonb;
  v_next jsonb := '[]'::jsonb;
  v_doc jsonb;
  v_people jsonb;
  v_unchanged jsonb;
  v_policy text;
  v_pair record;
  v_event uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array('natal','controle-operacional','2026-12-01'::date)::text,0));
  select * into strict v_sheet from public.schedule_operational_sheets
    where id='289a557f-0eae-4b1b-b24b-a5ac8481694e' for update;
  if v_sheet.city<>'natal' or v_sheet.sector<>'controle-operacional'
    or v_sheet.schedule_month<>'2026-12-01'::date
    or v_sheet.spreadsheet_id<>'1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64'
    or v_sheet.sheet_tab<>'Controle DEZEMBRO 26 - 5X2'
    or v_sheet.deleted_at is not null or v_sheet.deletion_requested_at is not null then
    raise exception 'A correção não corresponde à aba oficial selecionada';
  end if;
  if md5(v_sheet.planned_payload::text)<>'c687dc49b15b5e132b85c40f0b99b7e0'
    or md5(v_sheet.current_payload::text)<>'964c689c36e614b6ef83c75435a1a402' then
    raise exception 'A escala mudou desde a conferência; refaça a comparação antes de corrigir';
  end if;
  select * into strict v_draft from public.schedule_generation_drafts
    where id=v_sheet.draft_id and id='b39ea37b-fa47-419f-98c9-77f478859dac' for update;
  select * into strict v_official from public.schedule_uploads
    where id='52ae7409-3a2e-482e-8d7e-154caa9f072a' for update;
  if v_draft.status<>'approved' or v_draft.archived_at is not null
    or v_draft.city<>v_sheet.city or v_draft.sector<>v_sheet.sector
    or v_draft.schedule_month<>v_sheet.schedule_month
    or v_draft.policy_snapshot->>'officialScheduleId'<>v_official.id::text
    or v_official.city<>v_sheet.city or v_official.sector<>v_sheet.sector
    or v_official.schedule_month<>v_sheet.schedule_month
    or v_official.source_sheet<>v_sheet.sheet_tab then
    raise exception 'Vínculos divergentes; nenhuma alteração foi aplicada';
  end if;
  if not exists(select 1 from public.profiles
    where id=v_actor and role='admin' and status='active') then
    raise exception 'O administrador solicitante não está ativo';
  end if;
  if (select count(*) from jsonb_each(v_names))<>42
    or (select count(distinct value) from jsonb_each_text(v_names))<>42 then
    raise exception 'Mapa de nomes não é uma correspondência de 42 para 42';
  end if;
  v_before:=jsonb_build_object('planned_payload',v_sheet.planned_payload,
    'current_payload',v_sheet.current_payload,'draft_payload',v_draft.payload,
    'policy_snapshot',v_draft.policy_snapshot,'official_payload',v_official.payload);
  v_docs:=jsonb_build_array(v_sheet.planned_payload,v_sheet.current_payload,
    v_draft.payload,v_official.payload);
  for v_doc in select value from jsonb_array_elements(v_docs) loop
    if jsonb_array_length(v_doc->'people')<>42 or exists(
      select 1 from jsonb_array_elements(v_doc->'people') p
      where not (v_names ? (p->>'name'))
    ) or (select count(distinct p->>'name') from jsonb_array_elements(v_doc->'people') p)<>42 then
      raise exception 'A lista de pessoas diverge da correspondência conferida';
    end if;
    select jsonb_agg(p || jsonb_build_object('name',v_names->>(p->>'name')) order by ord),
      jsonb_agg(p-'name' order by ord)
      into v_people,v_unchanged
      from jsonb_array_elements(v_doc->'people') with ordinality entry(p,ord);
    if (select jsonb_agg(p-'name' order by ord)
        from jsonb_array_elements(v_people) with ordinality entry(p,ord))
        is distinct from v_unchanged then
      raise exception 'Dias, funções ou logins alterados; correção cancelada';
    end if;
    v_next:=v_next || jsonb_build_array(jsonb_set(v_doc,'{people}',v_people));
  end loop;
  v_policy:=v_draft.policy_snapshot::text;
  for v_pair in select key,value from jsonb_each_text(v_variants) loop
    -- Substitui somente valores/chaves JSON inteiros, nunca pedaços de texto.
    v_policy:=replace(v_policy,to_jsonb(v_pair.key)::text,to_jsonb(v_pair.value)::text);
  end loop;
  update public.schedule_operational_sheets
    set planned_payload=v_next->0,current_payload=v_next->1,updated_at=clock_timestamp()
    where id=v_sheet.id;
  update public.schedule_generation_drafts
    set payload=v_next->2,policy_snapshot=v_policy::jsonb where id=v_draft.id;
  update public.schedule_uploads set payload=v_next->3 where id=v_official.id;
  insert into public.schedule_generation_events(draft_id,actor_id,action,changes)
    values(v_draft.id,v_actor,'edited',jsonb_build_object(
      'kind','control_full_names_corrected','execution','supabase_cli_data_repair',
      'sheet_id',v_sheet.id,'official_id',v_official.id,'names',v_names,
      'employee_count',42,'assignments_unchanged',true,'before',v_before)) returning id into v_event;
  raise notice '42 nomes corrigidos, marcações preservadas; auditoria %',v_event;
end $repair$;
select jsonb_build_object('sheet_id',s.id,'employees',jsonb_array_length(s.current_payload->'people'),
  'names',(select jsonb_agg(p->>'name') from jsonb_array_elements(s.current_payload->'people')p),
  'audit_recorded',exists(select 1 from public.schedule_generation_events e
    where e.draft_id=s.draft_id and e.changes->>'kind'='control_full_names_corrected')) as correction
from public.schedule_operational_sheets s where id='289a557f-0eae-4b1b-b24b-a5ac8481694e';
commit;
