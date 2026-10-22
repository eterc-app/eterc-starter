import type { ReactNode } from "react";
import type { ValidationErrors } from "./Validation";

/**
 * Reply contract between client components and the etSubmit server action.
 * (Kept outside the 'use server' module so both tiers can import the type.)
 */

export type EtActionReply =
  | {
      kind: "node";
      node: ReactNode;
      errors: ValidationErrors | null;
      flash: string[];
      csrf_token: string;
      status: number;
    }
  | { kind: "error"; status: number; message: string };
