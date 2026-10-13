/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 *
  
 *
  
 * ============================================================
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[-0.01em] ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_10px_22px_-14px_rgba(var(--primary-rgb),0.9)] hover:brightness-110 hover:-translate-y-px",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_10px_22px_-14px_rgba(229,72,77,0.9)] hover:brightness-110 hover:-translate-y-px",
        outline:
          "border border-border bg-background text-foreground hover:border-primary/50 hover:text-primary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-foreground hover:bg-secondary hover:text-primary",
        link: "text-primary underline-offset-4 hover:underline",
        flare:
          "bg-[var(--flare)] text-[#3d2409] shadow-[0_10px_22px_-14px_rgba(255,138,52,0.95)] hover:bg-[var(--flare-600)] hover:text-white hover:-translate-y-px",
        ink: "bg-[var(--ink)] text-white hover:bg-[var(--ink-700)]",
        soft: "bg-primary/10 text-primary hover:bg-primary/16",
      },
      size: {
        xs: "h-7 rounded-lg px-2.5 text-xs",
        sm: "h-8 rounded-lg px-3 text-xs sm:h-9 sm:text-sm",
        default: "h-10 px-4 py-2",
        lg: "h-10 rounded-xl px-5 sm:h-11 sm:px-7 sm:text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
