import assert from "node:assert/strict";
import test from "node:test";

import { parsePositiveHstsMaxAge } from "./hsts-header.mjs";

test("accepts positive ages, quoted-string unescaping, and valid extension directives", () => {
  for (const [header, expected] of [
    ["max-age=31536000; includeSubDomains; preload", "31536000"],
    ['\t; MAX-AGE = "00060" ; INCLUDESUBDOMAINS ; ;', "00060"],
    [String.raw`max-age="\3\6\0\0"`, "3600"],
    [String.raw`max-age=60; extension="quoted; value=\"yes\""; empty=""`, "60"],
    ["max-age=999999999999999999999999999999999999", "999999999999999999999999999999999999"],
  ]) {
    assert.equal(parsePositiveHstsMaxAge(header), expected, header);
  }
});

test("rejects duplicate directives regardless of case or conflicting values", () => {
  for (const header of [
    "max-age=31536000; max-age=0",
    "max-age=0; max-age=31536000",
    "max-age=60; MAX-AGE=60",
    "max-age=60; includeSubDomains; INCLUDESUBDOMAINS",
    "max-age=60; extension=yes; EXTENSION=no",
  ]) {
    assert.throws(() => parsePositiveHstsMaxAge(header), /Duplicate|positive integer/u, header);
  }
});

test("rejects a value on includeSubDomains", () => {
  for (const header of [
    "max-age=31536000; includeSubDomains=off",
    'max-age=60; includeSubDomains=""',
    "max-age=60; INCLUDESUBDOMAINS=1",
  ]) {
    assert.throws(() => parsePositiveHstsMaxAge(header), /must not have a value/u, header);
  }
});

test("rejects missing, zero, or non-digit ages and malformed extension syntax", () => {
  for (const header of [
    "", "includeSubDomains", "max-age", "max-age=", "max-age=000",
    "max-age=-1", "max-age=1.5", 'max-age=""', 'max-age="1 2"',
    'max-age="60', "max-age=60; extension=", "max-age=60; bad/name=value",
    "max-age=60; extension=two words", 'max-age=60; extension="unfinished',
    "max-age=60, max-age=0", "max-age=60\r\n; preload",
  ]) {
    assert.throws(() => parsePositiveHstsMaxAge(header), /HSTS/u, header);
  }
});
