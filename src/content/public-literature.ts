export type PublicLiteratureReference = Readonly<{
  href: string;
  term: string;
}>;

export function projectPublicLiteratureReference(
  value: unknown,
): PublicLiteratureReference | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const terms = url.searchParams.getAll("term");
    const parameterNames = [...url.searchParams.keys()];
    if (
      url.protocol !== "https:" ||
      url.hostname !== "pubmed.ncbi.nlm.nih.gov" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.hash !== "" ||
      parameterNames.length !== 1 ||
      parameterNames[0] !== "term" ||
      terms.length !== 1 ||
      terms[0]!.trim().length === 0
    ) {
      return null;
    }
    return Object.freeze({ href: url.href, term: terms[0]! });
  } catch {
    return null;
  }
}
