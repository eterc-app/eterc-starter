import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

function get_text_content(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(get_text_content).join(" ")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return get_text_content(node.props.children)
  }
  return ""
}

function is_icon(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false
  const type = node.type as {
    displayName?: string
    render?: { displayName?: string }
  }
  if (typeof type === "string") return type === "svg"
  return typeof type.displayName === "string" || typeof type.render?.displayName === "string"
}

function has_icon(node: React.ReactNode): boolean {
  if (Array.isArray(node)) return node.some(has_icon)
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return false
  return is_icon(node) || has_icon(node.props.children)
}

function get_action_word(text: string): string {
  const label = text.toLowerCase()
  if (/^(sign|log) in\b/.test(label)) return "Login"
  if (/^return to sign in\b/.test(label)) return "Login"
  if (/^(go home|go to homepage)\b/.test(label)) return "Home"
  if (/^go to admin panel\b/.test(label)) return "Admin"
  if (/^(go back|back to)\b/.test(label)) return "Back"
  if (/^get started\b/.test(label)) return "Start"
  if (/^need help\b/.test(label)) return "Help"
  if (/^new\b/.test(label)) return "Create"
  return text.split(/\s+/)[0]
}

function first_word_only(
  node: React.ReactNode,
  state: { remaining: boolean; word: string },
): React.ReactNode {
  if (typeof node === "string") {
    if (!state.remaining) return null
    state.remaining = false
    return state.word
  }
  if (Array.isArray(node)) {
    return node.map((child) => first_word_only(child, state))
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    if (is_icon(node) || node.props.children === undefined) return node
    return React.cloneElement(node, undefined, first_word_only(node.props.children, state))
  }
  return node
}

const buttonVariants = cva(
  "group/button m-0 inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:text-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        outline:
          "border-border bg-card text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary",
        ghost:
          "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:outline-destructive",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-15 px-6 text-base [&_svg:not([class*='size-'])]:size-5",
        icon: "size-10 rounded-full",
        "icon-xs": "size-7 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-full [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-11 rounded-full",
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
  children,
  title,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const fullText = get_text_content(children).replace(/\s+/g, " ").trim()
  const hasIcon = has_icon(children)
  const isIconOnly = !fullText && hasIcon
  const buttonSize = isIconOnly && !size?.startsWith("icon") ? "icon" : size
  const normalizedChildren = first_word_only(children, {
    remaining: true,
    word: get_action_word(fullText),
  })
  const content = fullText && !hasIcon
    ? asChild && React.isValidElement<{ children?: React.ReactNode }>(normalizedChildren)
      ? React.cloneElement(
          normalizedChildren,
          undefined,
          <>
            {normalizedChildren.props.children}
            <ArrowRight aria-hidden="true" />
          </>,
        )
      : (
          <>
            {normalizedChildren}
            <ArrowRight aria-hidden="true" />
          </>
        )
    : normalizedChildren

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={buttonSize}
      className={cn(
        buttonVariants({ variant, size: buttonSize, className }),
        buttonSize?.startsWith("icon") && "rounded-full",
      )}
      title={title ?? (fullText || undefined)}
      aria-label={ariaLabel ?? (fullText || undefined)}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }
