"use client";

import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  LinkProps & {
    children: ReactNode;
  };

/** Same as Next.js `Link` — name kept for existing imports. */
export function TransitionLink(props: Props) {
  return <Link {...props} />;
}
