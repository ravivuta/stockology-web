import Image from "next/image";
import { withAppBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

export function AppLogo({
  size = 40,
  className,
  rounded = "rounded-xl",
}: {
  size?: number;
  className?: string;
  rounded?: string;
}) {
  return (
    <Image
      src={withAppBasePath("/brand/stocks-pm-ios-logo.png")}
      alt="Stocks PM app logo"
      width={size}
      height={size}
      priority
      className={cn("shrink-0 object-cover", rounded, className)}
    />
  );
}
