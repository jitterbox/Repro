export interface HarRedactionPolicy {
  readonly allowedHeaders: readonly string[];
  readonly allowedQueryParams: readonly string[];
  readonly allowRequestBodyForUrls: readonly string[];
  readonly allowResponseBodyForUrls: readonly string[];
  readonly redactedValue: string;
}

export interface HarRedactionPolicyInput {
  readonly allowedHeaders?: readonly string[];
  readonly allowedQueryParams?: readonly string[];
  readonly allowRequestBodyForUrls?: readonly string[];
  readonly allowResponseBodyForUrls?: readonly string[];
  readonly redactedValue?: string;
}

export function denyByDefaultHarPolicy(
  input: HarRedactionPolicyInput = {},
): HarRedactionPolicy {
  return {
    allowedHeaders: input.allowedHeaders ?? [],
    allowedQueryParams: input.allowedQueryParams ?? [],
    allowRequestBodyForUrls: input.allowRequestBodyForUrls ?? [],
    allowResponseBodyForUrls: input.allowResponseBodyForUrls ?? [],
    redactedValue: input.redactedValue ?? '[redacted]',
  };
}
