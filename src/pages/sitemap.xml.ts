const pages = ['/', '/features', '/savings', '/setup-faq', '/support', '/privacy', '/terms'];

export const GET = ({ site }: { site?: URL }) => {
  const siteUrl = site ?? new URL('https://huddleway.com');
  const urls = pages
    .map((page) => {
      const url = new URL(page, siteUrl).toString();

      return `<url><loc>${url}</loc></url>`;
    })
    .join('');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};