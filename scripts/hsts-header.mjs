// RFC 6797 section 6.1: validate every directive before accepting the policy.
// Input is an unfolded HTTP field value, as returned by response.headers.get().
export function parsePositiveHstsMaxAge(header) {
  if (typeof header !== "string" || !/^[\t\u0020-\u007e\u0080-\u00ff]*$/u.test(header)) {
    throw new Error("Malformed HSTS header");
  }
  // HTTP tokens or quoted strings; a semicolon inside quotes is not a separator.
  const directive = /[ \t]*(?:([!#$%&'*+.^_`|~\w-]+)(?:[ \t]*=[ \t]*([!#$%&'*+.^_`|~\w-]+|"(?:[^"\\]|\\[\t -~])*"))?)?[ \t]*(?:;|$)/uy;
  const names = new Set();
  let position = 0;
  let maxAge = null;

  while (position < header.length) {
    directive.lastIndex = position;
    const match = directive.exec(header);
    if (!match || match[0].length === 0) throw new Error("Malformed HSTS directive");
    position = directive.lastIndex;
    if (!match[1]) continue; // The grammar permits empty semicolon-separated entries.

    const name = match[1].toLowerCase();
    if (names.has(name)) throw new Error(`Duplicate HSTS directive: ${name}`);
    names.add(name);
    const value = match[2];
    if (name === "includesubdomains" && value !== undefined) {
      throw new Error("HSTS includeSubDomains must not have a value");
    }
    if (name === "max-age") {
      const seconds = value?.startsWith('"')
        ? value.slice(1, -1).replace(/\\(.)/gu, "$1")
        : value;
      if (!seconds || !/^[0-9]+$/u.test(seconds) || !/[1-9]/u.test(seconds)) {
        throw new Error("HSTS max-age must be a positive integer");
      }
      maxAge = seconds; // Preserve the decimal string without numeric overflow.
    }
  }
  if (maxAge === null) throw new Error("Missing HSTS max-age");
  return maxAge;
}
