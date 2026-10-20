"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { ValidationErrors } from "@/engine/Validation";

/**
 * UI state context — carries validation errors, flash messages and the CSRF
 * token from the server (page render or server action reply) down to client
 * form components.
 */

export interface TgUiState {
  errors: ValidationErrors | null;
  flash: string[];
  csrf_token: string;
}

const defaultState: TgUiState = { errors: null, flash: [], csrf_token: "" };

const TgUiContext = createContext<TgUiState>(defaultState);

export function TgUiProvider({
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
    <TgUiContext.Provider value={{ errors, flash, csrf_token }}>
      {children}
    </TgUiContext.Provider>
  );
}

export function useTgUi(): TgUiState {
  return useContext(TgUiContext);
}
