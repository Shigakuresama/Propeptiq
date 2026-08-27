"use client";

import { useEffect, useRef } from "react";

export function CommandResultNotice({
  error,
  message,
  className,
  heading = error ? "Command not completed" : "Authoritative command read-back",
}: {
  error: boolean;
  message: string;
  className?: string;
  heading?: string;
}) {
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) noticeRef.current?.focus();
  }, [error, message]);

  return (
    <div
      ref={noticeRef}
      className={`${error ? "error-record" : "info-record"}${className ? ` ${className}` : ""}`}
      role={error ? "alert" : "status"}
      aria-live={error ? undefined : "polite"}
      tabIndex={error ? -1 : undefined}
    >
      <strong>{heading}</strong>
      <p className="mt-2">{message}</p>
    </div>
  );
}
