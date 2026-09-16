// Which Zoom rooms are allowed to reach the recordings page.
//
// Every recording.completed event on the Zoom account hits the webhook, including
// personal meeting rooms that have nothing to do with training. The allow list is
// held in company_settings.zoom_allowed_rooms and edited on the recordings page.

// Zoom sends a straight apostrophe in a room name such as
// "Collective Realty Co.'s Zoom Room", but a name typed or pasted on a Mac often
// carries a curly one. Fold both, plus casing and repeated spaces, before comparing.
export function normalizeRoomName(value: string | null | undefined): string {
  return String(value || '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// An empty allow list means the feature has not been configured yet, so everything
// is let through. That keeps the webhook behaving exactly as it did before the
// setting existed until a room is actually listed.
export function isRoomAllowed(
  meetingTitle: string | null | undefined,
  allowedRooms: string[] | null | undefined
): boolean {
  const list = (allowedRooms || []).map(normalizeRoomName).filter(Boolean)
  if (list.length === 0) return true
  return list.includes(normalizeRoomName(meetingTitle))
}
