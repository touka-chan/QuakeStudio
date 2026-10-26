import { useEffect } from 'react';

import { BRANDING } from '@/content/branding';
import { contentThemeCss } from '@/content/theme';

/* =========================================================================
   Content side effects
   -------------------------------------------------------------------------
   Title, description and the two editable data-colour groups. Mounted once by
   both the simulator and the admin, and intentionally invisible.
   ========================================================================= */

export function ContentEffects() {
  useEffect(() => {
    document.title = BRANDING.documentTitle;

    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement('meta');
      description.name = 'description';
      document.head.appendChild(description);
    }
    description.content = BRANDING.metaDescription;

    const id = 'quakestudio-content-theme';
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = contentThemeCss();
  }, []);

  return null;
}
