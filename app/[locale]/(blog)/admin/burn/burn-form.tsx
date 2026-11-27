"use client";

import { useRef, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { encryptBurnMessage } from "@/lib/burn/crypto";
import { BURN_EXPIRIES, MAX_MESSAGE_BYTES, isBurnExpiry, type BurnExpiry } from "@/lib/burn/protocol";

type CreateError = "invalidSize" | "httpsRequired" | "signInRequired" | "forbidden" | "unconfigured" | "createError";

export function BurnForm({ readPath }: { readPath: string }) {
  const t = useTranslations("Burn");
  const format = useFormatter();
  const linkField = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [expiry, setExpiry] = useState<BurnExpiry>("24h");
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<CreateError | null>(null);
  const [copyStatus, setCopyStatus] = useState<"copied" | "copyManually" | null>(null);
  const [pending, setPending] = useState(false);
  const bytes = new TextEncoder().encode(message).byteLength;

  async function createMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    if (!message.trim() || bytes > MAX_MESSAGE_BYTES) {
      setError("invalidSize");
      return;
    }

    if (!window.crypto?.subtle) {
      setError("httpsRequired");
      return;
    }

    setPending(true);
    try {
      const { envelope, fragment } = await encryptBurnMessage(message);
      const response = await fetch("/api/burn/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...envelope, expiry }),
      });
      const body = await response.json();

      switch (body.code) {
        case "SIGN_IN_REQUIRED":
          setError("signInRequired");
          return;
        case "FORBIDDEN":
          setError("forbidden");
          return;
        case "UNCONFIGURED":
          setError("unconfigured");
          return;
      }

      if (response.status !== 201 || typeof body.expiresAt !== "string" || isNaN(Date.parse(body.expiresAt))) {
        setError("createError");
        return;
      }

      setResult({ url: new URL(readPath + fragment, window.location.origin).href, expiresAt: body.expiresAt });
      setCopyStatus(null);
      setMessage("");
    } catch {
      setError("createError");
    } finally {
      setPending(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      linkField.current?.focus();
      linkField.current?.select();
      setCopyStatus("copyManually");
    }
  }

  if (result) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t("linkReady")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("expiresAt", { date: format.dateTime(new Date(result.expiresAt), { dateStyle: "medium", timeStyle: "short" }) })}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input ref={linkField} aria-label={t("shareLink")} value={result.url} readOnly className="min-w-0 font-mono" />
            <Button type="button" onClick={() => copyLink(result.url)}>{t("copyLink")}</Button>
          </div>
          <p className="text-sm text-muted-foreground" role="status">{copyStatus ? t(copyStatus) : t("shareHint")}</p>
          <Button type="button" variant="outline" onClick={() => setResult(null)}>{t("createAnother")}</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <form className="space-y-5" onSubmit={createMessage}>
          <div className="space-y-2">
            <label className="font-medium" htmlFor="burn-message">{t("messageLabel")}</label>
            <Textarea
              id="burn-message"
              value={message}
              required
              autoComplete="off"
              spellCheck={false}
              aria-describedby="burn-message-size"
              aria-invalid={bytes > MAX_MESSAGE_BYTES || undefined}
              disabled={pending}
              className="min-h-44 max-h-80 resize-y"
              onChange={(event) => setMessage(event.target.value)}
            />
            <p id="burn-message-size" className="text-xs text-muted-foreground">
              {t("byteCount", { used: bytes, max: MAX_MESSAGE_BYTES })}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <label className="block font-medium" htmlFor="burn-expiry">{t("expiryLabel")}</label>
              <select
                id="burn-expiry"
                value={expiry}
                disabled={pending}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring sm:w-auto"
                onChange={(event) => {
                  const value = event.target.value;
                  if (isBurnExpiry(value)) setExpiry(value);
                }}
              >
                {BURN_EXPIRIES.map((item) => <option key={item} value={item}>{t(`expiry.${item}`)}</option>)}
              </select>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={pending || !message.trim() || bytes > MAX_MESSAGE_BYTES}
              className="h-10"
            >
              {t(pending ? "creating" : "createLink")}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
