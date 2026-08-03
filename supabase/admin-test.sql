-- 1) No painel do Supabase, abra Authentication > Users > Add user.
-- 2) Crie o usuário abaixo com uma senha temporária forte e marque o e-mail como confirmado.
-- 3) Depois execute esta instrução no SQL Editor.

select private.bootstrap_admin_by_email('admtecnicatechnet@gmail.com');

-- O e-mail é apenas uma sugestão de teste. Troque-o antes de publicar em produção.
