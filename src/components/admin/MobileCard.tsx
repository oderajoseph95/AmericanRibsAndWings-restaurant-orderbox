import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MobileCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function MobileCard({ children, className, onClick }: MobileCardProps) {
  return (
    <Card 
      className={cn("cursor-pointer active:scale-[0.98] transition-transform", className)}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {children}
      </CardContent>
    </Card>
  );
}

interface MobileCardRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function MobileCardRow({ label, value, className }: MobileCardRowProps) {
  return (
    <div className={cn("flex justify-between items-center py-1", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}
