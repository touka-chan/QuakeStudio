import * as React from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';

function ScrollArea({
  className,
  children,
  allowHorizontalScroll = false,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  /**
   * Let the contents scroll sideways as well as down.
   *
   * Off by default, because the viewport clips by default and a panel that
   * scrolls sideways is a panel where something has overflowed — usually a
   * layout mistake nobody can see, because the content is simply gone.
   *
   * Opted into for one place: the results panel, whose comparison table is a
   * genuine horizontal scroll rather than an accident. Six columns of figures
   * will not fit a 320px column at a readable size, and shrinking the type to
   * force them in is the version where the numbers stop being legible.
   */
  allowHorizontalScroll?: boolean;
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
          allowHorizontalScroll && 'overflow-x-auto',
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
