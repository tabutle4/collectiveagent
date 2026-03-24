export function getCentralTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
}

export function formatCentralDate(date?: Date | string): string {
  const d = date ? new Date(date) : new Date()
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  })
}

export function getCentralDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) // Returns YYYY-MM-DD
}

export function getCentralISOString(): string {
  const centralTime = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
  return new Date(centralTime).toISOString()
}