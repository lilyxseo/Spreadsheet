function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

export async function getRequestRole(_request, _env) {
  return 'FULL_ACCESS';
}

export async function requirePicRole({ request, env }) {
  const role = await getRequestRole(request, env);
  return { ok: true, role };
}
