"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
} from "@/components/ui/sheet";

export interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "destructive" | "default";
}

export type ConfirmPresentation = "dialog" | "drawer";

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Promise-based destructive confirmation. Render the returned `dialog` once in
 * the page and `await confirm({...})` before running a destructive action.
 *
 * Pages that keep every overlay in a drawer can pass `presentation="drawer"`
 * to render the same confirmation as a right-side sheet.
 */
export function useConfirm(presentation: ConfirmPresentation = "dialog") {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    []
  );

  const settle = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const dialog =
    presentation === "drawer" ? (
      <Sheet
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <SheetContent className="w-full max-w-[440px]" showCloseButton={false}>
          <SheetHeader>
            <DialogTitle className="text-lg font-medium">
              {pending?.title ?? ""}
            </DialogTitle>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 p-4">
            <DialogDescription className="text-sm leading-6 not-italic">
              {pending?.description}
            </DialogDescription>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => settle(false)}>
                {pending?.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={pending?.tone === "default" ? "default" : "destructive"}
                onClick={() => settle(true)}
              >
                {pending?.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    ) : (
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title ?? ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {pending?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={pending?.tone === "default" ? "default" : "destructive"}
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

  return { confirm, dialog };
}
