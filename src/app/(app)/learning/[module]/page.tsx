"use client";

/** One Learning module (`ModuleView`); an unknown module is a 404. */
import { notFound } from "next/navigation";
import { use } from "react";
import { ModuleView } from "@/components/learning/ModuleView";
import { moduleOf } from "@/lib/learning/modules";

export default function LearningModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: slug } = use(params);
  const learningModule = moduleOf(slug);
  if (!learningModule) notFound();
  return <ModuleView module={learningModule} />;
}
