import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Standard shadcn/ui helper: merges conditional class names (clsx) then
 * resolves Tailwind conflicts so the last matching utility wins (e.g.
 * cn('p-2', condition && 'p-4') always ends up with exactly one padding
 * class instead of both). Used throughout components/ui and the rest of
 * the component tree wherever a className is built conditionally. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
