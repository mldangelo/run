import { createHash } from 'node:crypto';
import { type DefaultTreeAdapterTypes, parse } from 'parse5';
import { eventData } from './adapters.mts';

// Bump when extracted text changes so cached evidence is fetched and extracted again.
export const EXTRACTOR_VERSION = 'html-evidence-v2';
export const hash = (text: string) =>
  createHash('sha256').update(text).digest('hex');
export const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

export function canonicalUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      'Only public HTTP(S) URLs without credentials are supported',
    );
  if (
    [...url.searchParams.keys()].some((key) =>
      /token|secret|password|signature|api.?key|^auth$/i.test(key),
    )
  )
    throw new Error('Credential-bearing URLs are not supported');
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^fbclid$|^gclid$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}

export interface Evidence {
  version: string;
  text: string;
  links: string[];
}

// Keep visible prose AND structured metadata: their disagreement is evidence.
// Never execute scripts or serialize application state, cookies or account data;
// host adapters read only listed fields from embedded event JSON.
export function extract(
  html: string,
  url: string,
  maxChars = 60_000,
): Evidence {
  const document = parse(html);
  const text: string[] = [];
  const metadata: string[] = [];
  const links = new Set<string>();
  let pageData: string | undefined;
  const link = (value: string) => {
    try {
      const target = canonicalUrl(value, url);
      if (new URL(target).origin === new URL(url).origin) links.add(target);
    } catch {
      /* Invalid, private-token and non-HTTP links are not leads. */
    }
  };
  function jsonEvents(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) jsonEvents(item);
      return;
    }
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record['@type'])
      ? record['@type']
      : [record['@type']];
    if (types.some((type) => typeof type === 'string' && /Event$/.test(type))) {
      metadata.push(`JSON-LD ${JSON.stringify(record)}`);
      if (typeof record.url === 'string') link(record.url);
    } else {
      for (const item of Object.values(record)) jsonEvents(item);
    }
  }
  function visit(node: DefaultTreeAdapterTypes.Node) {
    if (node.nodeName === '#text' && 'value' in node) {
      text.push(node.value);
      return;
    }
    if ('tagName' in node) {
      const attr = (name: string) =>
        node.attrs.find((a) => a.name === name)?.value || '';
      const tag = node.tagName;
      if (tag === 'script') {
        const raw = node.childNodes
          .map((n) => ('value' in n ? n.value : ''))
          .join('');
        if (attr('type') === 'application/ld+json') {
          try {
            jsonEvents(JSON.parse(raw));
          } catch {
            throw new Error('Malformed JSON-LD; manual inspection needed');
          }
        } else if (
          attr('id') === '__NEXT_DATA__' &&
          attr('type') === 'application/json'
        )
          pageData = raw;
        return;
      }
      if (
        ['style', 'svg', 'template', 'noscript', 'nav', 'footer'].includes(tag)
      )
        return;
      if (
        attr('hidden') ||
        node.attrs.some((a) => a.name === 'hidden') ||
        attr('aria-hidden') === 'true'
      )
        return;
      if (tag === 'meta') {
        const name = attr('property') || attr('name');
        if (/^(description|og:(title|description)|event:.*)$/.test(name))
          metadata.push(`${name}: ${normalize(attr('content'))}`);
      }
      if (tag === 'time' && attr('datetime'))
        metadata.push(`datetime: ${attr('datetime')}`);
      if (tag === 'a' && attr('href')) link(attr('href'));
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  }
  visit(document);
  metadata.push(...eventData(url, pageData));
  const body = normalize(text.join(' '));
  if (
    /just a moment|verify (you are|you're) human|checking your browser|access denied|enable javascript and cookies/i.test(
      body,
    ) ||
    /\/(login|signin|sign-in)(\/|$)/i.test(new URL(url).pathname)
  )
    throw new Error(
      'Access challenge or sign-in page; manual inspection needed',
    );
  if (body.length < 80 && !metadata.some((item) => item.startsWith('JSON-LD ')))
    throw new Error(
      'Insufficient public page text; may require browser or sign-in',
    );
  const evidence = [...metadata.sort(), `Page text: ${body}`].join('\n');
  // Do not silently drop the end of a calendar or hide a conflicting sentence.
  if (evidence.length > maxChars)
    throw new Error(
      `Evidence exceeds ${maxChars} characters; needs a focused adapter`,
    );
  return {
    version: EXTRACTOR_VERSION,
    text: evidence,
    links: [...links].sort(),
  };
}

/* Pages that are never an event listing: calendar exports and other files,
   account and organizer dashboards, and race-platform utility pages such as
   donations, insurance, sponsors, refunds, course maps and results. */
const NOT_A_LISTING = [
  /\/(login|signin|sign-in|signup|account|logout|dashboard)(\/|$)/i,
  /\.(ics|pdf|png|jpe?g|gif|svg|webp|js|json|css|xml|zip)$/i,
];
const RACE_UTILITY_PAGE =
  /^\/Race\/(.+\/)?(Donate|Photos|Results|FindARunner|Sponsors?|RaceInsurance|RefundPolicy|CourseMaps|Volunteer|Store|TopFundraisers|BecomeFundraiser)(\/|$)/i;

export function eventLinks(evidence: Evidence, parent: string): string[] {
  const host = new URL(parent).hostname;
  return evidence.links.filter((value) => {
    if (value === parent) return false;
    const url = new URL(value);
    if (NOT_A_LISTING.some((pattern) => pattern.test(url.pathname)))
      return false;
    if (
      /runsignup\.com$/.test(url.hostname) &&
      RACE_UTILITY_PAGE.test(url.pathname)
    )
      return false;
    return (
      /\/(events?|e)\/[^/]+/i.test(url.pathname) ||
      (/sfrrc\.org$/.test(host) && url.searchParams.has('item_id')) ||
      (/runsignup\.com$/.test(host) && /^\/Race\//.test(url.pathname)) ||
      (/^(www\.)?lu\.ma$|^(www\.)?luma\.com$/.test(host) &&
        /^\/[a-z0-9]{8}$/.test(url.pathname))
    );
  });
}
