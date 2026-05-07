export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string): string {
  if (!path) return BASE_PATH || "/";
  if (!path.startsWith("/")) return `${BASE_PATH}/${path}`;
  if (BASE_PATH && path === BASE_PATH) return path;
  if (BASE_PATH && path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
