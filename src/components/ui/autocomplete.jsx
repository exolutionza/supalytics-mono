import React, { useState } from "react"
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils" // Or your preferred className helper

export function Autocomplete(props) {
  const { items = [], placeholder = "Search...", onSelect, className } = props

  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")

  // Called when user selects an item
  function handleSelect(value) {
    setInputValue(value)
    setOpen(false)
    if (onSelect) {
      onSelect(value)
    }
  }

  return React.createElement(
    Popover,
    { open, onOpenChange: setOpen },
    // Trigger for the popover: a simple <input> wrapped in a <div>
    React.createElement(
      PopoverTrigger,
      { asChild: true },
      React.createElement(
        "div",
        { className: cn("w-full", className) },
        React.createElement("input", {
          className: cn(
            "w-full px-3 py-2 border rounded-md focus:outline-none"
          ),
          placeholder: placeholder,
          value: inputValue,
          onChange: (e) => {
            setInputValue(e.target.value)
            setOpen(true)
          },
          onKeyDown: (e) => {
            if (e.key === "Escape") {
              setOpen(false)
              e.currentTarget.blur()
            }
          },
        })
      )
    ),

    // PopoverContent: displays the Command list for autocomplete
    React.createElement(
      PopoverContent,
      { align: "start", className: "p-0 w-full" },
      React.createElement(
        Command,
        null,
        React.createElement(CommandInput, {
          value: inputValue,
          onValueChange: (val) => setInputValue(val),
          placeholder: placeholder,
        }),
        React.createElement(
          CommandList,
          null,
          React.createElement(CommandEmpty, null, "No results found."),
          React.createElement(
            CommandGroup,
            null,
            items.map((item) =>
              React.createElement(
                CommandItem,
                {
                  key: item.value,
                  onSelect: () => handleSelect(item.label),
                  className: "cursor-pointer",
                },
                item.label
              )
            )
          )
        )
      )
    )
  )
}
