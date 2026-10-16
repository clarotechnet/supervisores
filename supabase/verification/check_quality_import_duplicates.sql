-- SOMENTE LEITURA. Nao e migration e nao altera nem apaga dados.
-- Executar apenas no projeto supervisortechnet: rwstmomeldwrjmczrmnp.
-- Confere a ultima versao publicada de cada base, nao a soma do historico.
-- Chave de TC igual a tcRowKey: WO + login + fim do trabalho normalizado.

with bases(kind, painel) as (
  values
    ('certification'::text, 'QQ e Certificacao - TC'::text),
    ('technical_visit'::text, 'Visita tecnica - TC'::text)
), ultima_versao as (
  select distinct on (kind)
    id, kind, source_file, published_at, row_count, chunk_count
  from public.quality_imports
  where kind in ('certification', 'technical_visit')
    and published_at is not null
  order by kind, published_at desc, created_at desc, id desc
), blocos as (
  select v.kind, v.id, b.chunk_index, b.records
  from ultima_versao v
  join public.quality_certification_data b on b.import_id = v.id
  where v.kind = 'certification'
  union all
  select v.kind, v.id, b.chunk_index, b.records
  from ultima_versao v
  join public.quality_technical_visit_data b on b.import_id = v.id
  where v.kind = 'technical_visit'
), contagem_blocos as (
  select id, count(*) as quantidade, min(chunk_index) as primeiro, max(chunk_index) as ultimo
  from blocos
  group by id
), linhas as (
  select b.id,
    coalesce(r.item->>'wo', '') as wo,
    coalesce(r.item->>'login', '') as login,
    coalesce(r.item->>'finish', '') as fim
  from blocos b
  cross join lateral jsonb_array_elements(b.records) as r(item)
), partes as (
  select *,
    regexp_match(btrim(fim), '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})') as data_partes,
    regexp_match(fim, '[[:space:]]([0-9]{1,2}):([0-9]{2})(:([0-9]{2}))?') as hora_partes
  from linhas
), chaves as (
  select id, wo, login, fim,
    wo || '|' || login || '|' ||
    case
      when data_partes is null then btrim(fim)
      else data_partes[3] || '-' || lpad(data_partes[2], 2, '0') || '-' ||
        lpad(data_partes[1], 2, '0') || 'T' ||
        case
          when hora_partes is null then '00:00:00'
          else lpad(hora_partes[1], 2, '0') || ':' || hora_partes[2] || ':' ||
            coalesce(hora_partes[4], '00')
        end
    end as chave
  from partes
), contagem_linhas as (
  select id,
    count(*) as registros_lidos,
    count(distinct chave) as atendimentos_unicos,
    count(*) - count(distinct chave) as registros_duplicados,
    count(*) filter (where btrim(wo) = '' or btrim(login) = '' or btrim(fim) = '') as linhas_sem_chave
  from chaves
  group by id
)
select
  b.painel,
  v.source_file as arquivo_da_versao_ativa,
  v.published_at at time zone 'America/Sao_Paulo' as publicada_em,
  v.row_count as registros_do_manifesto,
  case when v.id is not null then coalesce(c.registros_lidos, 0) end as registros_lidos,
  case when v.id is not null then coalesce(c.atendimentos_unicos, 0) end as atendimentos_unicos,
  case when v.id is not null then coalesce(c.registros_duplicados, 0) end as registros_duplicados,
  case when v.id is not null then coalesce(c.linhas_sem_chave, 0) end as linhas_sem_chave,
  case
    when v.id is null then 'SEM BASE PUBLICADA'
    when coalesce(c.registros_lidos, 0) <> v.row_count
      or coalesce(cb.quantidade, 0) <> v.chunk_count
      or cb.primeiro <> 0 or cb.ultimo <> v.chunk_count - 1 then 'BASE INCOMPLETA - CONFERIR'
    when c.linhas_sem_chave > 0 then 'CHAVES AUSENTES - CONFERIR'
    when c.registros_duplicados > 0 then 'DUPLICATAS ENCONTRADAS'
    else 'OK - SEM DUPLICACAO'
  end as resultado
from bases b
left join ultima_versao v on v.kind = b.kind
left join contagem_linhas c on c.id = v.id
left join contagem_blocos cb on cb.id = v.id
order by b.kind;
