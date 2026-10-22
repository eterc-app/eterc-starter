"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { ValidationErrors } from "@/engine/Validation";

/**
 * UI state context — carries validation errors, flash messages and the CSRF
 * token from the server (page render or server action reply) down to client
 * form components.
 */

export interface EtUiState {
  errors: ValidationErrors | null;
  flash: string[];
  csrf_token: string;
}

const defaultState: EtUiState = { errors: null, flash: [], csrf_token: "" };

const EtUiContext = createContext<EtUiState>(defaultState);

export function EtUiProvider({
  children,
  errors = null,
  flash = [],
  csrf_token = "",
}: {
  children: ReactNode;
  errors?: ValidationErrors | null;
  flash?: string[];
  csrf_token?: string;
}) {
  return (
    <EtUiContext.Provider value={{ errors, flash, csrf_token }}>
      {children}
    </EtUiContext.Provider>
  );
}

export function useEtUi(): EtUiState {
  return useContext(EtUiContext);
}
