function profileDeviceLocation(session) {
  const raw = String(session?.location || session?.ipAddress || "Unknown location").trim();
  if (!raw) return "Unknown location";
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return raw;
  const city = parts.slice(0, -1).join(", ").replace(/^City of\s+/i, "");
  return `${city}, ${profileCountryAbbreviation(parts.at(-1))}`;
}

function profileCountryAbbreviation(country) {
  const names = {
    "United Kingdom": "UK",
    "United States": "US"
  };
  return names[country] || country;
}

function profileDeviceIp(session, location) {
  const ipAddress = String(session?.ipAddress || "").trim();
  return ipAddress && ipAddress !== location ? ipAddress : "";
}
