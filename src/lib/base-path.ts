export const APP_BASE_PATH = "/stocks-pm";

export function withAppBasePath(path: string): string {
  if (!path || path === "/") return APP_BASE_PATH;
  if (!path.startsWith("/")) return `${APP_BASE_PATH}/${path}`;
  if (path === APP_BASE_PATH || path.startsWith(`${APP_BASE_PATH}/`)) return path;
  return `${APP_BASE_PATH}${path}`;
}

export function normalizeAppPathname(pathname: string): string {
  if (pathname === APP_BASE_PATH) return "/";
  if (pathname.startsWith(`${APP_BASE_PATH}/`)) {
    const stripped = pathname.slice(APP_BASE_PATH.length);
    return stripped || "/";
  }
  return pathname;
}
