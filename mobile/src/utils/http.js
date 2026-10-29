// Pure HTTP helpers shared by the updater and offline downloads. No imports, so node tests can load it.

// HTTP/2 responses arrive with lower-case header names, HTTP/1.1 ones usually capitalised.
export const header = (headers, name) => {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : "";
};
