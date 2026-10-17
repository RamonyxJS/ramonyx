/**
 * Structural copy of the Standard Schema v1 interface.
 * Spec: https://github.com/standard-schema/standard-schema
 *
 * We depend on the shape, not on any specific schema library.
 */
export interface StandardPathSegment {
  readonly key: PropertyKey;
}

export interface StandardIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | StandardPathSegment>;
}

export type StandardResult<Output> =
  | { readonly value: Output }
  | { readonly issues: readonly StandardIssue[] };

export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
  readonly types?: { readonly input: Input; readonly output: Output };
}

export interface StandardSchema<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaProps<Input, Output>;
}
