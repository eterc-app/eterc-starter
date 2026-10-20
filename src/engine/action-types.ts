import type { ReactNode } from "react";
import type { ValidationErrors } from "./validation";

/**
 * Reply contract between client components and the tgSubmit server action.
 * (Kept outside the 'use server' module so both tiers can import the type.)
 */

export type TgActionReply =
  | {
      kind: "node";
      node: ReactNode;
      errors: ValidationErrors | null;
      flash: string[];
      csrfToken: string;
      status: number;
    }
  | { kind: "error"; status: number; message: string };
