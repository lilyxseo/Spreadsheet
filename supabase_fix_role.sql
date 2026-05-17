alter table public.users
alter column role set default 'User';

update public.users
set role = 'User'
where role is null
   or role = ''
   or role = 'Warga KST';
