import site from '../data/site.json';

const a = site.address;

export const fullAddress = `${a.line1}, ${a.line2}, ${a.city}, ${a.state} ${a.pincode}, ${a.country}`;
export const shortAddress = `Yelachenahalli, Kanakapura Road, ${a.city}`;

// Exact pin from Site settings → Map location. Falls back to the locality
// (not the street address, which makes Google show unrelated businesses).
const lat = String(site.map?.lat ?? '').trim();
const lng = String(site.map?.lng ?? '').trim();
export const hasPin = /^-?\d+(\.\d+)?$/.test(lat) && /^-?\d+(\.\d+)?$/.test(lng);

const point = `${lat},${lng}`;
const area = encodeURIComponent(`${shortAddress} ${a.pincode}`);
const target = hasPin ? point : area;

export const mapEmbed = `https://maps.google.com/maps?q=${target}&z=${hasPin ? 17 : 15}&hl=en&output=embed`;
export const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${target}`;
export const openMapUrl = site.map?.link || `https://www.google.com/maps/search/?api=1&query=${target}`;
