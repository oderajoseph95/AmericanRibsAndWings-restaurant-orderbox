import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeSelectorProps {
  value: number | 'custom';
  onChange: (days: number | 'custom', range?: DateRange) => void;
  customRange?: DateRange;
}

export function DateRangeSelector({ value, onChange, customRange }: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange | undefined>(customRange);

  const presets = [
    { label: '7 days', value: 7 },
    { label: '14 days', value: 14 },
    { label: '30 days', value: 30 },
  ];

  const handlePresetClick = (days: number) => {
    onChange(days);
  };

  const handleCustomSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      setTempRange(range);
    } else if (range?.from) {
      setTempRange({ from: range.from, to: range.from });
    }
  };

  const handleApplyCustom = () => {
    if (tempRange?.from && tempRange?.to) {
      onChange('custom', tempRange);
      setIsOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant={value === preset.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePresetClick(preset.value)}
        >
          {preset.label}
        </Button>
      ))}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value === 'custom' ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
          >
            <CalendarIcon className="h-4 w-4" />
            {value === 'custom' && customRange
              ? `${format(customRange.from, 'MMM d')} - ${format(customRange.to, 'MMM d')}`
              : 'Custom'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={tempRange?.from}
            selected={tempRange}
            onSelect={handleCustomSelect as any}
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="p-3 border-t flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApplyCustom} disabled={!tempRange?.from || !tempRange?.to}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
