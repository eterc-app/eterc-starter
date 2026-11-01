export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationErrorItem {
  path: (string | number)[];
  message: string;
}

export interface ValidationFailure {
  success: false;
  errors: ValidationErrorItem[];
}

export type ValidationOutcome<T> = ValidationSuccess<T> | ValidationFailure;

export interface IValidationSchema<T = unknown> {
  safeParse(input: unknown): ValidationOutcome<T>;
  parse(input: unknown): T;
}

