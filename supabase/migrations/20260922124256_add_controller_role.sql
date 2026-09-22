-- O valor fica em uma migration separada porque o PostgreSQL só permite usar
-- um novo valor de enum depois que a transação que o criou foi confirmada.
alter type public.app_role add value if not exists 'controller';
