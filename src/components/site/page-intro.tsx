export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="max-w-[72ch] pb-12 pt-14 sm:pb-16 sm:pt-20 lg:pb-20 lg:pt-24">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-5 text-balance font-heading text-page leading-[1.02] text-ink">
        {title}
      </h1>
      <p className="mt-6 max-w-[68ch] text-pretty text-lg leading-8 text-muted-ink">
        {description}
      </p>
    </header>
  );
}
