import React from 'react';
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from 'lucide-react';
import { cn } from "../../lib/utils";
import { Button } from "./Button";

export function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/40 backdrop-blur-xs duration-100",
        className
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-white p-4 text-sm text-slate-800 shadow-xl border border-slate-200 duration-100 outline-none sm:max-w-sm",
          className
        )}
        {...props}
      >
        {/* 拡大表示(文字サイズ特大)などで中身がビューポートより長くなり、Popup自体が
            スクロールする場合でも、閉じるボタンだけはsticky(高さ0のラッパー内で
            絶対配置)でスクロール追従させ、常にタップできる状態を保つ */}
        {showCloseButton && (
          <div className="sticky top-2 h-0 -mb-4 z-10 col-span-full row-start-1">
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className="absolute right-0 top-0 size-11 text-slate-500 hover:text-slate-600"
                  size="icon-sm"
                />
              }
            >
              <XIcon className="size-4" />
              <span className="sr-only">閉じる</span>
            </DialogPrimitive.Close>
          </div>
        )}
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-semibold text-base leading-none text-slate-950",
        className
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-slate-500",
        className
      )}
      {...props}
    />
  );
}
