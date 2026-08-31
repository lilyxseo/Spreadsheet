function requiredEnvValue(env, name) {
  const value = String(env?.[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function keyWithPrefix(env, name, prefix) {
  const key = requiredEnvValue(env, name);
  if (!key.startsWith(prefix)) {
    throw new Error(`${name} must start with ${prefix}`);
  }
  return key;
}

export function getPublishableSupabaseConfig(env) {
  return {
    url: requiredEnvValue(env, 'SUPABASE_URL').replace(/\/$/, ''),
    key: keyWithPrefix(env, 'SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_'),
  };
}

export function getSecretSupabaseConfig(env) {
  return {
    url: requiredEnvValue(env, 'SUPABASE_URL').replace(/\/$/, ''),
    key: keyWithPrefix(env, 'SUPABASE_SECRET_KEY', 'sb_secret_'),
  };
}
