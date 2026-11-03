import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {manageUsersHandler} from './handler.ts';

const url=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
Deno.serve(manageUsersHandler(authorization=>({
 user:createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}}),
 admin:createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),
})));
