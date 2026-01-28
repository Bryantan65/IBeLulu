// Utility to geocode location names (e.g., 'bedok', 'tampines') to lat/lng using Google Geocoding API
// Usage: getLatLngForLocation('bedok').then(console.log)

const GEOCODE_API = 'https://maps.googleapis.com/maps/api/geocode/json';

export async function getLatLngForLocation(location, apiKey) {
  const url = `${GEOCODE_API}?address=${encodeURIComponent(location + ', Singapore')}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch geocode');
  const data = await res.json();
  if (data.status !== 'OK' || !data.results.length) throw new Error('No geocode result');
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}
