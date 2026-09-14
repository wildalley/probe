/**
 * Resolves region string into a country flag emoji and human-friendly display
 */
export function getRegionFlag(region: string): string {
  if (!region) return "🌐";
  const r = region.toUpperCase().trim();

  if (r.includes("US") || r.includes("UNITED STATES") || r.includes("AMERICA")) return "🇺🇸";
  if (r.includes("HK") || r.includes("HONG KONG") || r.includes("HONGKONG")) return "🇭🇰";
  if (r.includes("JP") || r.includes("JAPAN") || r.includes("TOKYO") || r.includes("OSAKA")) return "🇯🇵";
  if (r.includes("DE") || r.includes("GERMANY") || r.includes("FRANKFURT")) return "🇩🇪";
  if (r.includes("EU") || r.includes("EUROPE")) return "🇪🇺";
  if (r.includes("SG") || r.includes("SINGAPORE")) return "🇸🇬";
  if (r.includes("CN") || r.includes("CHINA") || r.includes("SHANGHAI") || r.includes("BEIJING") || r.includes("GUANGZHOU")) return "🇨🇳";
  if (r.includes("TW") || r.includes("TAIWAN") || r.includes("TAIPEI")) return "🇹🇼";
  if (r.includes("KR") || r.includes("KOREA") || r.includes("SEOUL")) return "🇰🇷";
  if (r.includes("GB") || r.includes("UK") || r.includes("LONDON") || r.includes("BRITAIN")) return "🇬🇧";
  if (r.includes("FR") || r.includes("FRANCE") || r.includes("PARIS")) return "🇫🇷";
  if (r.includes("CA") || r.includes("CANADA") || r.includes("TORONTO") || r.includes("VANCOUVER")) return "🇨🇦";
  if (r.includes("AU") || r.includes("AUSTRALIA") || r.includes("SYDNEY")) return "🇦🇺";
  if (r.includes("RU") || r.includes("RUSSIA") || r.includes("MOSCOW")) return "🇷🇺";
  if (r.includes("NL") || r.includes("NETHERLANDS") || r.includes("AMSTERDAM")) return "🇳🇱";
  if (r.includes("IN") || r.includes("INDIA") || r.includes("MUMBAI")) return "🇮🇳";
  if (r.includes("LOCAL") || r.includes("LAN") || r.includes("HOME")) return "🏠";

  return "🌐";
}
