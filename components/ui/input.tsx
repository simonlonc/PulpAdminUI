import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "./cn";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm pointer-coarse:min-h-11 dark:border-zinc-700",
        className
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input };
