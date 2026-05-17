alter table public.users
alter column role set default 'Warga KST';

update public.users
set role = 'Warga KST'
where role is null
   or role = ''
   or role = 'User';
