import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "press inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        // The one solid button: light pill, dark text.
        default: "bg-primary text-primary-foreground rounded-full hover:bg-primary/90",
        destructive:
          "bg-destructive text-background rounded-full hover:bg-destructive/90 focus-visible:ring-destructive/20",
        // Ghost = hairline ring, no fill. `outline` is kept as an alias so
        // existing call sites keep compiling.
        ghost: "rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)] hover:bg-accent",
        outline: "rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)] hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground rounded-full hover:bg-secondary/80",
        link: "text-brass underline-offset-4 hover:underline",
        // Retired alias (Task 3 of the redesign plan removes the callers).
        hero: "bg-primary text-primary-foreground rounded-full hover:bg-primary/90",
      },
      size: {
        default: "h-10 px-5 text-sm has-[>svg]:px-4",
        xs: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-4 text-[13px] has-[>svg]:px-3",
        lg: "h-11 px-6 text-sm has-[>svg]:px-5",
        xl: "h-[52px] px-6 text-[15px] font-semibold has-[>svg]:px-5",
        icon: "size-11",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
