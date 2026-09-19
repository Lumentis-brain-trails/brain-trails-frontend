"use client";

/**
 * Pairing and contact check before a run (backend V3-0005, sprint S16).
 *
 * The same steps as /record - choose the headband, connect, wait for four green lights -
 * so a session never starts on a band that is not sitting right. Starting anyway is
 * allowed but explicit. The simulated headbands are offered outside production, which is
 * also how the end-to-end tests run a protocol.
 */
import { useTranslations } from "next-intl";
import { ContactLights } from "@/components/ContactLights";
import { Button, Card, ErrorBanner, Segmented } from "@/components/ui";
import type { useMuse } from "@/lib/muse/useMuse";

export type HeadbandSource = "bluetooth" | "simulated" | "simulated-athena";

interface Props {
  muse: ReturnType<typeof useMuse>;
  source: HeadbandSource;
  onSource: (source: HeadbandSource) => void;
  simulatorAllowed: boolean;
  bluetoothSupported: boolean;
  override: boolean;
  onOverride: (value: boolean) => void;
  starting: boolean;
  onStart: () => void;
  onBack: () => void;
}

export function HeadbandPreflight({
  muse,
  source,
  onSource,
  simulatorAllowed,
  bluetoothSupported,
  override,
  onOverride,
  starting,
  onStart,
  onBack,
}: Props) {
  const t = useTranslations("run.preflight");
  const connected = muse.status === "connected";
  const options: { value: HeadbandSource; label: string }[] = [
    { value: "bluetooth", label: t("bluetooth") },
    ...(simulatorAllowed
      ? [
          { value: "simulated" as const, label: t("simulated") },
          { value: "simulated-athena" as const, label: t("simulated_athena") },
        ]
      : []),
  ];

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="type-subhead">{t("title")}</h2>
        <p className="type-caption mt-1 text-pretty text-ink-3">{t("intro")}</p>
      </div>
      {!connected && (
        <Segmented
          label={t("source")}
          value={source}
          onChange={onSource}
          options={options}
        />
      )}
      {source === "bluetooth" && !bluetoothSupported && (
        <ErrorBanner message={t("unsupported")} />
      )}
      {muse.error && <ErrorBanner message={muse.error} />}
      {!connected ? (
        <Button
          onClick={() => void muse.connect()}
          disabled={
            muse.status === "connecting" ||
            (source === "bluetooth" && !bluetoothSupported)
          }
        >
          {muse.status === "connecting" ? t("connecting") : t("connect")}
        </Button>
      ) : (
        <div className="space-y-4">
          <p className="text-ink-2">
            {t("connected", { name: muse.deviceName ?? "Muse" })}
          </p>
          <ContactLights quality={muse.quality} active={connected} />
          <p className="type-caption text-ink-3">
            {muse.allGood ? t("contact_ok") : t("contact_wait")}
          </p>
          {!muse.allGood && (
            <label className="flex cursor-pointer items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => onOverride(e.target.checked)}
                className="h-4 w-4 accent-(--accent)"
              />
              {t("override")}
            </label>
          )}
        </div>
      )}
      <div className="flex gap-3">
        <Button
          onClick={onStart}
          disabled={!connected || starting || !(muse.allGood || override)}
        >
          {starting ? t("starting") : t("start")}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
    </Card>
  );
}
