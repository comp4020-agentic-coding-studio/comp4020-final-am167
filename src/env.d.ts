/// <reference types="astro/client" />


declare namespace App {
  interface Locals {
    // the visitor's person id, from the kessler_person cookie (ADR 0002)
    person: string;
    // the operator they're signed in as, if any (ADR 0009)
    operator: import("./lib/operators.ts").Operator | null;
  }
}
