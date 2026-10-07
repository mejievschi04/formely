import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { I18nProvider } from './i18n/I18nContext';

/** Randează o rută în HTML static (folosit doar la build, de scripts/prerender.mjs). */
export function render(url) {
  const helmetContext = {};
  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <I18nProvider>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </I18nProvider>
    </HelmetProvider>,
  );
  return { html, helmet: helmetContext.helmet };
}
