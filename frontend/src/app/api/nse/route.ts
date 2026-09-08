import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SCRAPER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pathParam = searchParams.get('path');
  const urlParam = searchParams.get('url');

  let targetUrl: URL;
  try {
    if (urlParam) {
      targetUrl = new URL(urlParam);
    } else if (pathParam) {
      const cleanPath = pathParam.startsWith('/') ? pathParam : `/${pathParam}`;
      targetUrl = new URL(cleanPath, 'https://afx.kwayisi.org');
    } else {
      targetUrl = new URL('/nse/', 'https://afx.kwayisi.org');
    }

    // Security validation: strictly constrain requests to https://afx.kwayisi.org/nse*
    if (
      targetUrl.protocol !== 'https:' ||
      targetUrl.hostname !== 'afx.kwayisi.org' ||
      !targetUrl.pathname.startsWith('/nse')
    ) {
      return NextResponse.json(
        { error: 'Invalid target: only https://afx.kwayisi.org/nse/* paths are permitted.' },
        {
          status: 400,
          headers: CORS_HEADERS,
        }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid URL or path parameter.' },
      {
        status: 400,
        headers: CORS_HEADERS,
      }
    );
  }

  try {
    const upstreamRes = await fetch(targetUrl.toString(), {
      headers: SCRAPER_HEADERS,
      next: { revalidate: 300 },
    });

    if (!upstreamRes.ok) {
      return new Response(`Upstream error: ${upstreamRes.status} ${upstreamRes.statusText}`, {
        status: upstreamRes.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    const html = await upstreamRes.text();

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        ...CORS_HEADERS,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Proxy upstream fetch failed: ${error.message}` },
      {
        status: 502,
        headers: CORS_HEADERS,
      }
    );
  }
}
