/// <reference types="astro/client" />


declare namespace App {
  interface Locals {
    // the visitor's person id, from the kessler_person cookie (ADR 0002)
    person: string;
    // whether that cookie was only just made, for this request: someone
    // who hasn't loaded a page yet (a stream opened by a script, say) isn't
    // counted as listening (ADR 0016)
    newPerson: boolean;
    // the operator they're signed in as, if any (ADR 0009)
    operator: import("./lib/operators.ts").Operator | null;
  }
}
