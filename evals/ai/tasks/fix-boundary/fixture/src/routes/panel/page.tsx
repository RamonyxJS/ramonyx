import { readFileSync } from "node:fs";

export default function Panel() {
  return readFileSync ? null : null;
}
