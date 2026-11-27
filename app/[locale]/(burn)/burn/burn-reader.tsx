"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { decryptBurnMessage } from "@/lib/burn/crypto";
import { parseBurnFragment, readBurnCiphertext } from "@/lib/burn/protocol";

type ReaderState =
  | { status: "ready" | "reading" | "unavailable" | "readError" | "httpsRequired" }
  | { status: "revealed"; message: string };

function subscribeToFragment(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function currentFragment() {
  return window.location.hash;
}

function serverFragment() {
  return null;
}

export function BurnReader() {
  const t = useTranslations("Burn");
  const fragment = useSyncExternalStore(subscribeToFragment, currentFragment, serverFragment);

  if (fragment === null) return <p className="text-sm text-muted-foreground">{t("readerLoading")}</p>;

  const link = parseBurnFragment(fragment);
  if (!link) return <p className="text-sm text-muted-foreground">{t("invalidLink")}</p>;

  return <ReadMessage key={fragment} link={link} />;
}

function ReadMessage({ link }: { link: NonNullable<ReturnType<typeof parseBurnFragment>> }) {
  const t = useTranslations("Burn");
  const [state, setState] = useState<ReaderState>({ status: "ready" });

  useEffect(() => {
    function forgetRestoredMessage(event: PageTransitionEvent) {
      if (event.persisted) {
        setState((current) => current.status === "revealed" ? { status: "unavailable" } : current);
      }
    }

    window.addEventListener("pageshow", forgetRestoredMessage);
    return () => window.removeEventListener("pageshow", forgetRestoredMessage);
  }, []);

  async function reveal() {
    if (state.status !== "ready" && state.status !== "readError") return;

    if (!window.crypto?.subtle) {
      setState({ status: "httpsRequired" });
      return;
    }

    setState({ status: "reading" });
    try {
      const response = await fetch("/api/burn/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, token: link.token }),
        cache: "no-store",
      });

      if (response.status === 404) {
        setState({ status: "unavailable" });
        return;
      }

      if (!response.ok) throw new Error("Unable to claim message");
      const envelope = readBurnCiphertext(await response.json());
      if (!envelope) throw new Error("Invalid message");

      setState({ status: "revealed", message: await decryptBurnMessage(envelope, link.key) });
    } catch {
      setState({ status: "readError" });
    }
  }

  if (state.status === "revealed") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium" role="status">{t("revealed")}</p>
        <pre className="max-h-[60dvh] overflow-auto whitespace-pre-wrap wrap-anywhere rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed">
          {state.message}
        </pre>
      </div>
    );
  }

  if (state.status === "unavailable" || state.status === "httpsRequired") {
    return <p className="text-sm text-muted-foreground" role="status">{t(state.status)}</p>;
  }

  return (
    <div className="space-y-4" aria-busy={state.status === "reading"}>
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>{t("readDescription")}</p>
        <p>{t("readHint")}</p>
        {state.status === "readError" && <p className="text-destructive" role="alert">{t("readError")}</p>}
      </div>
      <Button
        type="button"
        size="lg"
        onClick={reveal}
        disabled={state.status === "reading"}
        className="h-10 w-full sm:w-auto"
      >
        {t(state.status === "reading" ? "reading" : state.status === "readError" ? "retry" : "reveal")}
      </Button>
    </div>
  );
}
