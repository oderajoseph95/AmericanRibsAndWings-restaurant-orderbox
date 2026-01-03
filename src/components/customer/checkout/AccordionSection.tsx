import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionSectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  summary: string;
  isActive: boolean;
  isCompleted: boolean;
  isDisabled?: boolean;
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
          <p className="font-medium text-sm">{title}</p>
          {!isActive && summary && (
            <p className="text-xs text-muted-foreground truncate">{summary}</p>
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
