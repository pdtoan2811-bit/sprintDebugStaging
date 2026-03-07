import * as React from "react"
import { format, parseISO } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
    value?: string
    onChange: (date: string) => void
    className?: string
}

export function DatePicker({ value, onChange, className }: DatePickerProps) {
    const date = value ? parseISO(value) : undefined

    const handleSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            // Format as YYYY-MM-DD to match the existing input[type="date"] format
            onChange(format(selectedDate, "yyyy-MM-dd"))
        }
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-ed focus:outline-none",
                        !date && "text-zinc-500",
                        className
                    )}
                >
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                    <CalendarIcon className="h-4 w-4 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[100]" align="start">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleSelect}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    )
}
