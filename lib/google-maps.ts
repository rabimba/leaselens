declare global {
  interface Window {
    google?: {
      maps?: {
        importLibrary?: (library: string) => Promise<any>;
      };
    };
    __leaseLensGoogleMapsPromise?: Promise<void>;
    __leaseLensGoogleMapsInit?: () => void;
  }
}

function createMapsScriptUrl(apiKey: string) {
  const params = new URLSearchParams({
    key: apiKey,
    libraries: 'places',
    loading: 'async',
    callback: '__leaseLensGoogleMapsInit',
    v: 'weekly',
  });

  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

async function ensureGoogleMaps(apiKey: string) {
  if (typeof window === 'undefined') {
    throw new Error('Google Maps can only load in the browser.');
  }

  if (window.google?.maps?.importLibrary) {
    return;
  }

  if (!apiKey) {
    throw new Error('A Google Maps API key is required for address autocomplete.');
  }

  if (!window.__leaseLensGoogleMapsPromise) {
    window.__leaseLensGoogleMapsPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-leaselens-google-maps="true"]');

      window.__leaseLensGoogleMapsInit = () => {
        resolve();
      };

      if (existingScript) {
        existingScript.addEventListener('error', () => reject(new Error('Google Maps failed to load.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = createMapsScriptUrl(apiKey);
      script.async = true;
      script.defer = true;
      script.dataset.leaselensGoogleMaps = 'true';
      script.onerror = () => reject(new Error('Google Maps failed to load.'));

      document.head.appendChild(script);
    });
  }

  await window.__leaseLensGoogleMapsPromise;
}

export async function loadPlacesLibrary(apiKey: string) {
  try {
    await ensureGoogleMaps(apiKey);
  } catch (error) {
    window.__leaseLensGoogleMapsPromise = undefined;
    throw error;
  }

  if (!window.google?.maps?.importLibrary) {
    throw new Error('Google Maps Places library is unavailable.');
  }

  return window.google.maps.importLibrary('places');
}
