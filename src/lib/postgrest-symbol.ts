const reserved = /[.,:()"]/;

/** PostgREST splits unquoted filter values on `.`, so `BRK.B` must be quoted. */
export function postgrestEqValue(value: string): string {
  return reserved.test(value) ? `"${value.replace(/"/g, "")}"` : value;
}

/** Value for `.filter("symbol", "in", postgrestInList(symbols))`. */
export function postgrestInList(values: string[]): string {
  const unique = [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
  return `(${unique.map((value) => postgrestEqValue(value)).join(",")})`;
}
