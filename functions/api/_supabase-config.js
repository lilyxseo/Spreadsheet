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

function keyWithLegacyCompatibility(env, currentName, currentPrefix, legacyName) {
  const currentKey = String(env?.[currentName] || '').trim();
  if (currentKey) return keyWithPrefix(env, currentName, currentPrefix);

  const legacyKey = String(env?.[legacyName] || '').trim();
  if (!legacyKey) throw new Error(`${currentName} is required`);
  console.warn(`${legacyName} is deprecated; migrate deployment configuration to ${currentName}`);
  return legacyKey;
}

export function getPublishableSupabaseConfig(env) {
  return {
    url: requiredEnvValue(env, 'SUPABASE_URL').replace(/\/$/, ''),
    key: keyWithLegacyCompatibility(
      env,
      'SUPABASE_PUBLISHABLE_KEY',
      'sb_publishable_',
      'SUPABASE_ANON_KEY'
    ),
  };
}

export function getSecretSupabaseConfig(env) {
  return {
    url: requiredEnvValue(env, 'SUPABASE_URL').replace(/\/$/, ''),
    key: keyWithLegacyCompatibility(
      env,
      'SUPABASE_SECRET_KEY',
      'sb_secret_',
      'SUPABASE_SERVICE_ROLE_KEY'
    ),
  };
}
