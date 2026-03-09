import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface SheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
    if (!open) return null;

    return (
        <>
            {React.Children.map(children, child => {
                if (React.isValidElement(child) && (child.type === SheetTrigger || child.type === SheetContent)) {
                    return React.cloneElement(child as React.ReactElement<any>, { open, onOpenChange });
                }
                return child;
            })}
        </>
    );
}

export function SheetTrigger({ asChild, children, open, onOpenChange }: any) {
    if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<any>, {
            onClick: (e: any) => {
                onOpenChange?.(true);
                const props = children.props as any;
                if (props && typeof props.onClick === 'function') {
                    props.onClick(e);
                }
            }
        });
    }
    return (
        <button onClick={() => onOpenChange?.(true)}>
            {children}
        </button>
    );
}

export function SheetContent({ side = "right", className, children, open, onOpenChange }: any) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/80" onClick={() => onOpenChange?.(false)}>
            <div
                className={cn(
                    "fixed z-50 gap-4 bg-zinc-950 p-6 shadow-lg transition ease-in-out overflow-y-auto",
                    "inset-y-0 right-0 h-full border-l border-zinc-800",
                    className
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
                <button
                    onClick={() => onOpenChange?.(false)}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-zinc-950 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2"
                >
                    <X className="h-4 w-4 text-zinc-400" />
                    <span className="sr-only">Close</span>
                </button>
            </div>
        </div>
    );
}

interface SheetChildProps {
    children: React.ReactNode;
    className?: string;
}

export function SheetHeader({ children, className }: SheetChildProps) {
    return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}>{children}</div>
}

export function SheetTitle({ children, className }: SheetChildProps) {
    return <h2 className={cn("text-lg font-semibold text-zinc-50", className)}>{children}</h2>
}

export function SheetDescription({ children, className }: SheetChildProps) {
    return <p className={cn("text-sm text-zinc-400", className)}>{children}</p>
}
