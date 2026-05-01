import { GoogleGMark } from "@/components/auth/GoogleGMark";

export function GoogleOAuthButton({
  loading,
  onClick,
  label,
}: {
  loading: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="no-ui-hover flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200/95 bg-white px-4 py-3.5 text-sm font-semibold text-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-[transform,box-shadow,background-color] duration-200 hover:bg-zinc-50 hover:shadow-md active:scale-[0.99] disabled:pointer-events-none disabled:opacity-55"
    >
      <GoogleGMark className="h-5 w-5 shrink-0" />
      <span>{loading ? "Redirecting…" : label}</span>
    </button>
  );
}
