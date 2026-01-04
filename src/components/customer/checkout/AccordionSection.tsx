import { ChevronDown, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionSectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  summary: string;
  isActive: boolean;
  isCompleted: boolean;
  isDisabled?: boolean;
  hasError?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: "default" | "hero";
}

export function AccordionSection({
  id,
  title,
  icon,
  summary,
  isActive,
  isCompleted,
  isDisabled = false,
  hasError = false,
  onToggle,
  children,
  variant = "default"
}: AccordionSectionProps) {
  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden transition-all duration-300",
        isActive && "ring-2 ring-primary/50",
        isDisabled && "opacity-50 pointer-events-none",
        hasError && !isActive && "border-destructive ring-1 ring-destructive/50",
        variant === "hero" && isActive && "ring-2 ring-orange-500/50"
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        disabled={isDisabled}
        className={cn(
          "w-full flex items-center gap-3 p-3 text-left transition-colors",
          "hover:bg-muted/50",
          isActive && "bg-muted/30",
          variant === "hero" && isActive && "bg-gradient-to-r from-orange-500/10 to-primary/10"
        )}
      >
        {/* Status indicator */}
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
            isCompleted
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isCompleted ? (
            <Check className="h-4 w-4" />
          ) : (
            icon
          )}
        </div>

        {/* Title and summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn("font-medium text-sm", hasError && !isActive && "text-destructive")}>{title}</p>
            {hasError && !isActive && (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive animate-pulse" />
            )}
          </div>
          {!isActive && summary && (
            <p className={cn("text-xs truncate", hasError ? "text-destructive/80" : "text-muted-foreground")}>{summary}</p>
          )}
        </div>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            isActive && "rotate-180"
          )}
        />
      </button>

      {/* Content */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          isActive ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="p-3 pt-0 space-y-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
