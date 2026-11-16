import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { canonicalUrl } from './evidence.mts';

export interface PageResponse {
  status: number;
  url: string;
  body: string;
  etag?: string;
  modified?: string;
  contentType: string;
}
export type FetchPage = (
  url: string,
  headers: Record<string, string>,
) => Promise<PageResponse>;

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Public global-unicast IPv6 only; excludes mapped IPv4 and local ranges.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !/^2001:(db8|0):/i.test(address)
  );
}

export const fetchPage: FetchPage = async (initial, conditional) => {
  const signal = AbortSignal.timeout(20_000);
  let url = canonicalUrl(initial);
  for (let redirect = 0; redirect <= 5; redirect++) {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true });
    signal.throwIfAborted();
    if (
      !addresses.length ||
      addresses.some((item) => !publicAddress(item.address))
    )
      throw new Error('Source resolves to a non-public address');
    const selected = addresses[0];
    // Pin the checked address: a second DNS lookup must not reach local services.
    const response = await new Promise<{
      page: PageResponse;
      location?: string;
    }>((resolve, reject) => {
      const request = (parsed.protocol === 'https:' ? https : http).request(
        parsed,
        {
          method: 'GET',
          signal,
          headers: {
            'User-Agent':
              'SFRunIndexResearch/1.0 (+https://github.com/mldangelo/run)',
            Accept: 'text/html, application/xhtml+xml',
            'Accept-Encoding': 'identity',
            ...(redirect === 0 ? conditional : {}),
          },
          lookup: (_host, options, callback) => {
            if (options.all) callback(null, [selected]);
            else callback(null, selected.address, selected.family);
          },
        },
        (res) => {
          const status = res.statusCode || 0;
          const page = {
            status,
            url,
            body: '',
            etag: res.headers.etag,
            modified: res.headers['last-modified'],
            contentType: res.headers['content-type'] || '',
          };
          if (status !== 200) {
            res.resume();
            resolve({ page, location: res.headers.location });
            return;
          }
          if (
            res.headers['content-encoding'] &&
            res.headers['content-encoding'] !== 'identity'
          ) {
            res.destroy();
            reject(new Error('Unsupported compressed response'));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 2_000_000) {
              res.destroy(new Error('Page exceeds 2 MB'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () =>
            resolve({
              page: { ...page, body: Buffer.concat(chunks).toString('utf8') },
            }),
          );
        },
      );
      request.on('error', reject);
      request.end();
    });
    if (
      [301, 302, 303, 307, 308].includes(response.page.status) &&
      response.location
    ) {
      const next = canonicalUrl(response.location, url);
      if (
        new URL(url).protocol === 'https:' &&
        new URL(next).protocol !== 'https:'
      )
        throw new Error('HTTPS downgrade redirect rejected');
      url = next;
      continue;
    }
    return response.page;
  }
  throw new Error('Too many redirects');
};
