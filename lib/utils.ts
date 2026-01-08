/**
 * Utility function to merge Tailwind CSS classes
 * Handles conditional classes and basic conflict resolution
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs
    .filter(Boolean)
    .join(' ')
    .split(' ')
    .filter((cls, index, arr) => arr.indexOf(cls) === index) // Remove duplicates
    .join(' ')
}

