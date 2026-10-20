"use client";

/**
 * Play: one protocol with EEG, from the catalog (sprints S16, S18). The run itself is
 * `RunProtocol`; this page adds the pre-flight's "who is being recorded?" (backend T3),
 * which `?subject=` preselects - the patient page's "Record a session" sends it.
 */
import { useSearchParams } from "next/navigation";
import { use, useState } from "react";
import { RunProtocol } from "@/components/run/RunProtocol";
import { type RunTarget, SubjectPicker } from "@/components/run/SubjectPicker";

export default function RunProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const subject = useSearchParams().get("subject");
  const [target, setTarget] = useState<RunTarget>(
    subject ? { subjectId: subject } : {}
  );
  return (
    <RunProtocol
      protocolId={id}
      detailPath={`protocols/${id}`}
      backHref={`/protocols/${id}`}
      target={target}
      picker={
        <SubjectPicker protocolId={id} value={target} onChange={setTarget} />
      }
    />
  );
}
