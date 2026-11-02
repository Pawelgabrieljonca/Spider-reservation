import { useEffect } from 'react';

const SITE_URL = 'https://spider.bydgoszcz.pl';
const DEFAULT_TITLE = 'Centrum Wspinaczkowe Spider Bydgoszcz | Rezerwacja Treningów Online';
const DEFAULT_DESC =
  'Oficjalny system rezerwacji treningów wspinaczkowych online w Centrum Wspinaczkowym Spider w Bydgoszczy. Wybierz certyfikowanego instruktora, sprawdź grafik i zarezerwuj termin.';
const DEFAULT_IMAGE = `${SITE_URL}/separator.webp`;

function setMetaTag(attrName, attrValue, content) {
  if (!content) return;
  let element = document.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attrName, attrValue);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setLinkTag(rel, href) {
  if (!href) return;
  let element = document.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

export default function SEO({
  title,
  description = DEFAULT_DESC,
  path = '',
  image = DEFAULT_IMAGE,
  robots = 'index, follow',
  type = 'website',
  schema = null,
}) {
  useEffect(() => {
    // 1. Tytuł strony (document.title)
    const fullTitle = title
      ? title.includes('Spider')
        ? title
        : `${title} | CW Spider Bydgoszcz`
      : DEFAULT_TITLE;
    document.title = fullTitle;

    // 2. Canonical URL
    const canonicalUrl = `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    setLinkTag('canonical', canonicalUrl);

    // 3. Podstawowe meta tagi
    setMetaTag('name', 'description', description);
    setMetaTag('name', 'robots', robots);

    // 4. OpenGraph (Facebook / Social Media)
    setMetaTag('property', 'og:title', fullTitle);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:url', canonicalUrl);
    setMetaTag('property', 'og:type', type);
    setMetaTag('property', 'og:image', image);
    setMetaTag('property', 'og:site_name', 'Centrum Wspinaczkowe Spider Bydgoszcz');
    setMetaTag('property', 'og:locale', 'pl_PL');

    // 5. Twitter Card
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', fullTitle);
    setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:image', image);

    // 6. Opcjonalny dynamiczny Schema JSON-LD dla danej podstrony
    let scriptTag = document.getElementById('page-seo-schema');
    if (schema) {
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.id = 'page-seo-schema';
        scriptTag.type = 'application/ld+json';
        document.head.appendChild(scriptTag);
      }
      scriptTag.textContent = JSON.stringify(schema);
    } else if (scriptTag) {
      scriptTag.remove();
    }
  }, [title, description, path, image, robots, type, schema]);

  return null;
}

