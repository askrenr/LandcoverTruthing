/**
 * Parses the coordinate formats people actually paste: decimal degrees from
 * Google Maps, degrees/decimal-minutes from handheld GPS units, and full DMS
 * from older sources. Returns null rather than throwing — the caller is a text
 * input that re-parses on every keystroke.
 */

export function isValidLatitude(n: number): boolean {
  return Number.isFinite(n) && n >= -90 && n <= 90
}

export function isValidLongitude(n: number): boolean {
  return Number.isFinite(n) && n >= -180 && n <= 180
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

interface Component {
  value: number
  hemisphere: 'N' | 'S' | 'E' | 'W' | null
}

/**
 * One coordinate component: an optional leading hemisphere letter, one to three
 * numbers (degrees, minutes, seconds), and an optional trailing hemisphere letter.
 */
const COMPONENT = new RegExp(
  [
    '^',
    '([NSEW])?', // leading hemisphere
    '\\s*',
    '([+-]?\\d+(?:\\.\\d+)?)', // degrees
    '\\s*[°d]?\\s*',
    "(?:(\\d+(?:\\.\\d+)?)\\s*['m]?\\s*)?", // minutes
    '(?:(\\d+(?:\\.\\d+)?)\\s*["s]?\\s*)?', // seconds
    '([NSEW])?', // trailing hemisphere
    '$',
  ].join(''),
  'i',
)

function parseComponent(raw: string): Component | null {
  const text = raw.trim()
  if (!text) return null

  const match = COMPONENT.exec(text)
  if (!match) return null

  const [, lead, degStr, minStr, secStr, trail] = match

  // A hemisphere letter on both sides (e.g. "N34.5S") is contradictory and is
  // rejected here. Note this guard is NOT what rejects something like
  // "34.5NS": there, the trailing capture group can only match one letter, so
  // COMPONENT.exec fails to match at all and parseComponent returns null
  // before this line is ever reached.
  if (lead && trail) return null
  const hemisphere = ((lead ?? trail)?.toUpperCase() ?? null) as Component['hemisphere']

  const degrees = Number(degStr)
  if (!Number.isFinite(degrees)) return null

  const minutes = minStr === undefined ? 0 : Number(minStr)
  const seconds = secStr === undefined ? 0 : Number(secStr)
  if (minutes >= 60 || seconds >= 60) return null

  // A hemisphere letter carries the sign, so a signed degree alongside one is
  // ambiguous; reject rather than guess.
  if (hemisphere && /^[+-]/.test(degStr)) return null

  const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600
  let value = degrees < 0 ? -magnitude : magnitude
  if (hemisphere === 'S' || hemisphere === 'W') value = -value

  return { value, hemisphere }
}

/** Splits on comma, or on whitespace when there is no comma. */
function splitComponents(input: string): string[] {
  const trimmed = input.trim()
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((part) => part.trim()).filter(Boolean)
  }
  // Without a comma, the split point is the whitespace before the second
  // hemisphere letter or the second sign — fall back to halving on the widest
  // run of whitespace.
  const parts = trimmed.split(/\s{2,}/).filter(Boolean)
  if (parts.length === 2) return parts
  return splitOnHemisphereOrSign(trimmed)
}

function splitOnHemisphereOrSign(text: string): string[] {
  // Split after a hemisphere letter that is followed by more content.
  const afterHemisphere = /([NSEW])\s+(?=\S)/i.exec(text)
  if (afterHemisphere && afterHemisphere.index > 0) {
    const cut = afterHemisphere.index + 1
    return [text.slice(0, cut).trim(), text.slice(cut).trim()]
  }
  // Split before a leading hemisphere letter of the second component.
  const beforeHemisphere = /\s+(?=[NSEW]\s*[\d+-])/i.exec(text)
  if (beforeHemisphere) {
    return [
      text.slice(0, beforeHemisphere.index).trim(),
      text.slice(beforeHemisphere.index).trim(),
    ]
  }
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 2) return tokens
  // Space-separated DMS: six tokens plus up to two hemisphere letters. Only
  // take this halving guess when something in the text actually marks it as
  // DMS (a hemisphere letter or a degree/minute/second symbol) — a bare run
  // of numbers with no such marker is ambiguous (e.g. "34 5 -91 0" could be
  // read as one DMS pair or as two malformed decimal pairs) and is rejected
  // by returning a token list whose length isn't 2, rather than guessed at.
  const looksLikeDms = /[NSEW°'"]/i.test(text)
  if (looksLikeDms && tokens.length % 2 === 0) {
    const half = tokens.length / 2
    return [tokens.slice(0, half).join(' '), tokens.slice(half).join(' ')]
  }
  return tokens
}

/** Which axis a hemisphere letter names, or null when it names neither. */
function axisOf(hemisphere: Component['hemisphere']): 'latitude' | 'longitude' | null {
  if (hemisphere === 'N' || hemisphere === 'S') return 'latitude'
  if (hemisphere === 'E' || hemisphere === 'W') return 'longitude'
  return null
}

export function parseCoordinates(
  input: string,
): { latitude: number; longitude: number } | null {
  if (!input || !input.trim()) return null

  const rawParts = splitComponents(input)
  if (rawParts.length !== 2) return null

  const first = parseComponent(rawParts[0])
  const second = parseComponent(rawParts[1])
  if (!first || !second) return null

  // Hemisphere letters name the axis explicitly; otherwise assume lat, lng
  // order. When BOTH components carry a hemisphere letter, they must name
  // opposite axes (one of N/S and one of E/W) — two components naming the
  // same axis (e.g. "34.5N, 45.0S") leave the other axis with no supplied
  // value at all, so there is nothing to reorder into and the input is
  // rejected rather than having a value invented for the missing axis.
  const firstAxis = axisOf(first.hemisphere)
  const secondAxis = axisOf(second.hemisphere)
  if (firstAxis && secondAxis && firstAxis === secondAxis) return null

  let latComponent = first
  let lngComponent = second
  if (firstAxis === 'longitude' || secondAxis === 'latitude') {
    latComponent = second
    lngComponent = first
  }

  const latitude = latComponent.value
  const longitude = lngComponent.value
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null

  return { latitude, longitude }
}
