import { useId } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BUILDING_TEMPLATES } from '@/config/templates';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Template picker — the first thing a new user touches.
   -------------------------------------------------------------------------
   Picking a template replaces the whole building. Every entry carries a
   one-line description so the choice is not a guess.
   ========================================================================= */

export function TemplatePicker() {
  const templateId = useConfigStore((s) => s.templateId);
  const applyTemplate = useConfigStore((s) => s.applyTemplate);
  const id = useId();

  const selected = BUILDING_TEMPLATES.find((tpl) => tpl.id === templateId);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Start from a template
      </label>

      {/* The trigger shows the label ONLY. Putting the description inside the
          trigger made SelectValue render it too, which forced the control far
          wider than its container and pushed the whole page sideways on a
          phone. The description is rendered below instead. */}
      <Select value={templateId} onValueChange={applyTemplate}>
        <SelectTrigger id={id} aria-label="Building template" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BUILDING_TEMPLATES.map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>
              {tpl.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected ? (
        <p aria-live="polite" className="mt-1.5 text-xs text-muted-foreground">
          {selected.description}
        </p>
      ) : null}
    </div>
  );
}
