// Generates reviewable SQL only; never contacts a database or creates credentials.
import { readFileSync, writeFileSync } from 'node:fs';
if (!process.argv[2] || !process.argv[3])
  throw new Error(
    'Usage: node supabase/generate-member-setup.mjs mapping.json output.sql',
  );
const mapping = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!mapping.partners?.length || mapping.partners.length > 4)
  throw new Error('One to four partners are required');
const profiles = mapping.partners.map((partner, index) => {
  if (
    partner.id !== `p${index + 1}` ||
    !partner.name?.trim() ||
    !Number.isFinite(partner.sharePercent) ||
    partner.sharePercent < 0 ||
    partner.sharePercent > 100
  )
    throw new Error('Invalid partner profile');
  return {
    id: partner.id,
    username: `owner${index + 1}`,
    name: partner.name,
    role: 'شريك',
    avatarLetter: String(index + 1),
    phone: '',
    sharePercent: partner.sharePercent,
    totalPaidFromPocket: 0,
    totalWithdrawals: 0,
  };
});
if (
  Math.abs(profiles.reduce((sum, p) => sum + p.sharePercent, 0) - 100) > 0.0001
)
  throw new Error('Partner shares must total 100');
const members = [
  ...mapping.partners.map((partner, index) => ({
    email: partner.email?.trim().toLowerCase(),
    username: `owner${index + 1}`,
    partner_id: partner.id,
    role: 'partner',
  })),
  {
    email: mapping.cashierEmail?.trim().toLowerCase(),
    username: 'cashier',
    partner_id: null,
    role: 'cashier',
  },
];
if (!mapping.cashierEmail) members.pop();
if (
  members.some(
    (m) => !m.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email),
  ) ||
  new Set(members.map((m) => m.email)).size !== members.length
)
  throw new Error(
    'Provide different valid email addresses. No passwords are accepted.',
  );
const literal = (value) => "'" + String(value).replace(/'/g, "''") + "'";
const sql = `-- Generated setup: review emails and shares before executing.
-- Existing Auth users must already exist. Existing store contents are never replaced.
begin;
do $setup$
declare member jsonb;
begin
  for member in select * from jsonb_array_elements(${literal(JSON.stringify(members))}::jsonb) loop
    if (select count(*) from auth.users where lower(email)=member->>'email')<>1 then raise exception 'Missing or ambiguous Auth account: %',member->>'email'; end if;
  end loop;
end $setup$;
insert into public.bon_elagouz_store(id,partners) values('main_store',${literal(JSON.stringify(profiles))}::jsonb) on conflict(id) do nothing;
do $setup$
begin
  if not exists(select 1 from public.bon_elagouz_store where id='main_store' and partners @> ${literal(JSON.stringify(profiles.map((p) => ({ id: p.id }))))}::jsonb) then raise exception 'Existing store profiles must be reviewed before assigning members'; end if;
end $setup$;
insert into public.erp_members(user_id,username,partner_id,role)
select u.id,m->>'username',m->>'partner_id',m->>'role' from jsonb_array_elements(${literal(JSON.stringify(members))}::jsonb) m join auth.users u on lower(u.email)=m->>'email'
on conflict(user_id) do update set username=excluded.username,partner_id=excluded.partner_id,role=excluded.role;
commit;
`;
writeFileSync(process.argv[3], sql);
console.log('Generated setup SQL; no database connection was made.');
