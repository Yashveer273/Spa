const STORAGE_KEY = 'apkaspa_user_city';

export interface LocationData {
  city: string;
  state: string;
  formattedLocation: string; // e.g. "Lucknow, Uttar Pradesh"
}

// LocalStorage helpers
export const savedCityStorage = {
  get: (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set: (cityStr: string): void => {
    try {
      localStorage.setItem(STORAGE_KEY, cityStr);
    } catch (err) {
      console.error('Failed to save city to localStorage', err);
    }
  },
};

// Default value jab tak location fetch ho rahi ho
export let currentLocationString: string = savedCityStorage.get() || 'Detecting location...';

/**
 * Browser GPS aur OpenStreetMap se automatic City & State fetch karta hai.
 */
export async function detectCurrentLocation(): Promise<LocationData> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );

          if (!response.ok) {
            throw new Error('Failed to fetch location address.');
          }

          const data = await response.json();
          const address = data.address || {};

          // City aur State extract karna
          const city =
            address.city ||
            address.town ||
            address.village ||
            address.state_district ||
            address.county ||
            'Unknown City';

          const state = address.state || 'Unknown State';

          // Format: "City, State"
          const formattedLocation = `${city}, ${state}`;

          currentLocationString = formattedLocation;
          savedCityStorage.set(formattedLocation);

          resolve({
            city,
            state,
            formattedLocation,
          });
        } catch (err) {
          reject(err);
        }
      },
      (error) => {console.log(error);
        reject(new Error('Location permission denied or unavailable.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}