import { type ReactNode, ViewTransition } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      exit={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}

export function ProductTitleTransition({
  productId,
  children,
}: {
  productId: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition
      name={`product-title-${productId}`}
      share="text-morph"
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
