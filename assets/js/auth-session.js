export const unauthenticatedSession = Object.freeze({
  userId: null, username: "", displayName: "", role: "", isDeveloper: false,
  authSource: "none", authenticated: false,
});

export function createAuthSession({ session, user, isDeveloper = false, authSource = "unknown", role = "" } = {}) {
  const authenticated = Boolean(session?.access_token && user);
  return {
    userId: authenticated ? String(user.id || "") : null,
    username: authenticated ? String(user.username || user.email || "") : "",
    displayName: authenticated ? String(user.name || user.full_name || user.user_metadata?.full_name || user.email || "") : "",
    role: authenticated ? String(role || user.role || user.user_metadata?.role || "") : "",
    isDeveloper: authenticated && isDeveloper === true,
    authSource: authenticated ? authSource : "none",
    authenticated,
    user: authenticated ? user : null,
    accessToken: authenticated ? session.access_token : "",
  };
}

export function resolvePermissions(authSession, databaseUser = null) {
  if (!authSession || authSession.authenticated !== true) return null;
  const developer = authSession.isDeveloper === true;
  const isPic = String(databaseUser?.role || authSession.role || "").trim().toLowerCase().includes("pic");
  const crud = developer || isPic;
  return { read: true, create: crud, update: crud, delete: crud, crud, source: developer ? "developer" : isPic ? "pic" : "readonly" };
}
