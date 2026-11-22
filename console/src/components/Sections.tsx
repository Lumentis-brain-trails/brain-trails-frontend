"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui";

/**
 * An app with several pages on one screen: a segmented control and the chosen page.
 * A console app is one route (`/apps/<slug>`), so its sections are local state, not
 * URLs; the first one opens.
 */
export function Sections<T extends string>({
  label,
  sections,
}: {
  label: string;
  sections: { id: T; label: string; render: () => React.ReactNode }[];
}) {
  const [current, setCurrent] = useState<T>(sections[0].id);
  const chosen = sections.find((s) => s.id === current) ?? sections[0];
  return (
    <div className="grid gap-6">
      <div className="overflow-x-auto">
        <Segmented
          label={label}
          value={current}
          onChange={setCurrent}
          options={sections.map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>
      <div>{chosen.render()}</div>
    </div>
  );
}
