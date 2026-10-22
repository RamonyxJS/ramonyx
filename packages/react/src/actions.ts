// React helpers untuk action: pending status, optimistic form values, dan tombol submit.
// Hook bekerja dengan submit form yang diintersepsi client entry Ramonyx (tanpa JS tetap POST biasa).

import {
  type ButtonHTMLAttributes,
  createElement,
  type ReactElement,
  type ReactNode,
  startTransition,
  useEffect,
  useState,
} from "react";

export interface ActionStatusOptions {
  /** Cocokkan id/name form; tanpa opsi, event action apa pun di halaman ini dihitung. */
  readonly formId?: string;
}

export interface ActionStatus {
  readonly pending: boolean;
}

interface ActionEventDetail {
  readonly form?: HTMLFormElement;
}

function matchesForm(detail: ActionEventDetail | undefined, formId: string | undefined): boolean {
  if (formId === undefined) {
    return true;
  }
  const form = detail?.form;
  return form?.id === formId || form?.getAttribute("name") === formId;
}

/** Status pending submit form action; listen ke event client entry Ramonyx. */
export function useActionStatus(options: ActionStatusOptions = {}): ActionStatus {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const start = (event: Event): void => {
      if (matchesForm((event as CustomEvent<ActionEventDetail>).detail, options.formId)) {
        setPending(true);
      }
    };
    const end = (event: Event): void => {
      if (matchesForm((event as CustomEvent<ActionEventDetail>).detail, options.formId)) {
        setPending(false);
      }
    };
    document.addEventListener("ramonyx:actionstart", start);
    document.addEventListener("ramonyx:actionend", end);
    return () => {
      document.removeEventListener("ramonyx:actionstart", start);
      document.removeEventListener("ramonyx:actionend", end);
    };
  }, [options.formId]);
  return { pending };
}

/**
 * Nilai form optimistis: panggil `update` sebelum submit. Nilai bertahan sampai halaman
 * dirender ulang oleh server setelah action (bukan sekadar transisi React yang selesai).
 */
export function useOptimisticForm<T extends Record<string, string>>(
  initial: T,
): readonly [T, (next: Partial<T>) => void] {
  const [state, setState] = useState<T>(initial);
  return [
    state,
    (next: Partial<T>) => {
      startTransition(() => setState((current) => ({ ...current, ...next })));
    },
  ] as const;
}

export interface PendingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly pendingText?: ReactNode;
}

/** Tombol submit dengan `aria-busy` + disabled selama action berjalan. */
export function PendingButton({
  pendingText = "Mengirim…",
  children,
  ...rest
}: PendingButtonProps): ReactElement {
  const { pending } = useActionStatus();
  return createElement(
    "button",
    {
      ...rest,
      type: rest.type ?? "submit",
      "aria-busy": pending || undefined,
      disabled: rest.disabled === true || pending,
    },
    pending ? pendingText : children,
  );
}
