/**
 * Next.js `template.tsx` remounts on navigation — keep the shell instant; loading state
 * is handled by `loading.tsx` + shimmer route skeletons instead of motion delays here.
 */
export function RouteEnterTemplate({ children }: { children: React.ReactNode }) {
  return <div className="w-full">{children}</div>;
}
