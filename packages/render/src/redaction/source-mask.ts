export interface RrwebMaskInput {
  readonly maskAllInputs?: boolean;
  readonly maskInputOptions?: Readonly<Record<string, boolean>>;
  readonly maskTextClass?: string | RegExp;
  readonly maskTextSelector?: string;
}

export interface RrwebMaskOptions {
  readonly maskAllInputs: boolean;
  readonly maskInputOptions: Readonly<Record<string, boolean>>;
  readonly maskTextClass?: string | RegExp;
  readonly maskTextSelector?: string;
}

const SAFE_INPUT_MASKS: Readonly<Record<string, boolean>> = {
  color: true,
  date: true,
  'datetime-local': true,
  email: true,
  month: true,
  number: true,
  password: true,
  search: true,
  tel: true,
  text: true,
  time: true,
  url: true,
  week: true,
};

export function rrwebInvertedSafeDefaults(
  input: RrwebMaskInput = {},
): RrwebMaskOptions {
  const maskInputOptions = {
    ...SAFE_INPUT_MASKS,
    ...(input.maskInputOptions ?? {}),
  };

  return {
    maskAllInputs: input.maskAllInputs ?? true,
    maskInputOptions,
    ...(input.maskTextClass === undefined
      ? {}
      : { maskTextClass: input.maskTextClass }),
    ...(input.maskTextSelector === undefined
      ? {}
      : { maskTextSelector: input.maskTextSelector }),
  };
}
