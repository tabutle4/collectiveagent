const platformBases: Record<string, string> = {
  instagram: 'https://instagram.com/',
  tiktok: 'https://www.tiktok.com/@',
  threads: 'https://www.threads.net/@',
}

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'threads'
  | 'youtube'
  | 'linkedin'
  | 'facebook'

const ensureProtocol = (value: string) => {
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export const normalizeSocialUrl = (
  value: string | null | undefined,
  platform: SocialPlatform
): string | null => {
  if (!value) return null
  let url = value.trim()
  if (!url) return null

  if (!/^https?:\/\//i.test(url)) {
    url = url.replace(/^@/, '')
    if (platformBases[platform]) {
      url = `${platformBases[platform]}${url}`
    } else {
      url = ensureProtocol(url)
    }
  }

  try {
    const normalized = new URL(url)
    return normalized.toString()
  } catch {
    return null
  }
}

export const sanitizeSocialForRoster = (
  value: string | null | undefined,
  platform: SocialPlatform
) => normalizeSocialUrl(value, platform)

export const friendlySocialLabel = (value: string | null | undefined) => {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value)
      return parsed.hostname.replace('www.', '') + parsed.pathname
    } catch {
      return value
    }
  }
  return value.startsWith('@') ? value : `@${value}`
}

