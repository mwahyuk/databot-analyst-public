// Supabase Edge Function: execute-sql
// Deploy: supabase functions deploy execute-sql
//
// Fungsi ini mengeksekusi query SELECT dari DataBot AI ke database Supabase.
// Hanya menerima SELECT — mutasi data (INSERT/UPDATE/DELETE/DROP) diblokir.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || ['*'];

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function validateSQL(sql: string): boolean {
  const upper = sql.trim().toUpperCase();
  if (!upper.startsWith('SELECT')) return false;
  const forbidden = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE'];
  return !forbidden.some(kw => new RegExp(`\\b${kw}\\b`).test(upper));
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(origin) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      });
    }

    const { sql } = await req.json();
    if (!sql || typeof sql !== 'string') {
      return new Response(JSON.stringify({ error: 'Field "sql" wajib diisi' }), {
        status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      });
    }

    if (!validateSQL(sql)) {
      return new Response(JSON.stringify({ error: 'Hanya query SELECT yang diizinkan' }), {
        status: 403, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verifikasi user terautentikasi
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      });
    }

    const { data, error } = await supabase.rpc('execute_raw_sql', { query: sql });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
  }
});
