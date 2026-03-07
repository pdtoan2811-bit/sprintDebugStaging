import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "secondary" | "destructive" | "outline"
}

// Simple custom Badge matching Shadcn look
function Badge({ className, variant = "default", ...props }: BadgeProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2",
                {
                    "border-transparent bg-zinc-50 text-zinc-900 hover:bg-zinc-50/80": variant === "default",
                    "border-transparent bg-zinc-800 text-zinc-50 hover:bg-zinc-800/80": variant === "secondary",
                    "border-transparent bg-red-900 text-zinc-50 hover:bg-red-900/80": variant === "destructive",
                    "text-zinc-50 border-zinc-800": variant === "outline",
                },
                className
            )}
            {...props}
        />
    )
}

export { Badge }
