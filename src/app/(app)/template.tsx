/**
 * No enter animation: `template.tsx` remounts on every client navigation; fading
 * from opacity 0 made each switch feel slow. Loading UI is `loading.tsx`.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return children;
}
