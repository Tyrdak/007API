import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INGEST_SECRET = process.env.INGEST_SECRET;
// Normalize table name to avoid cases like "public.public.motions"
const RAW_TABLE_NAME = process.env.MOTIONS_TABLE || "motions";
const TABLE_NAME = (() => {
  const parts = RAW_TABLE_NAME.split(/[.:]/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : RAW_TABLE_NAME;
})();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    // 🔥 Parsing robuste du body
    type BodyObject = Record<string, unknown>;
    let parsedBody: unknown = req.body;
    if (typeof parsedBody === "string") {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {
        try {
          const fixed = (parsedBody as string).replace(/'/g, '"');
          parsedBody = JSON.parse(fixed);
        } catch {
          return res.status(400).json({ ok: false, error: "Invalid JSON body" });
        }
      }
    }
    const body: BodyObject = (parsedBody && typeof parsedBody === "object") ? (parsedBody as BodyObject) : {};

    // ------------------- Auth -------------------
    const providedKey =
      (typeof body["Key"] === "string" ? (body["Key"] as string) :
      typeof body["key"] === "string" ? (body["key"] as string) : "");
    if (process.env.NODE_ENV === "production") {
      if (!INGEST_SECRET) {
        return res.status(500).json({ ok: false, error: "INGEST_SECRET is not configured" });
      }
      if (providedKey !== INGEST_SECRET) {
        return res.status(403).json({ ok: false, error: "ACCESS DENIED" });
      }
    } else {
      if (INGEST_SECRET && providedKey !== INGEST_SECRET) {
        return res.status(403).json({ ok: false, error: "ACCESS DENIED" });
      }
    }

    // ------------------- Données -------------------
    const message = typeof body["Msg"] === "string" ? (body["Msg"] as string) : "Vodka-Martini";
    const host = typeof body["Host"] === "string" ? (body["Host"] as string) : "unknown";
    const urlFromBody = (() => {
      if (!body) return null;
      if (typeof body["Url"] === "string") return body["Url"] as string;
      if (typeof body["url"] === "string") return body["url"] as string;
      if (typeof body["URL"] === "string") return body["URL"] as string;
      const foundKey = Object.keys(body).find((k) => k.trim().toLowerCase() === "url");
      if (!foundKey) return null;
      const value = body[foundKey];
      return typeof value === "string" ? value : null;
    })();

    const parseNum = (v: unknown): number => {
      if (typeof v === "number") return v;
      if (typeof v === "string") return parseFloat(v);
      return NaN;
    };
    let latitude = parseNum(body["lat"] ?? body["latitude"]);
    let longitude = parseNum(body["lon"] ?? body["longitude"]);
    if ((isNaN(latitude) || isNaN(longitude)) && typeof body["loc"] === "string") {
      const m = (body["loc"] as string).trim().match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
      if (m) {
        latitude = parseFloat(m[1]);
        longitude = parseFloat(m[2]);
      }
    }

    const nowIso = new Date().toISOString();

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "0.0.0.0";

    const raspberryId = `rpi-${ip.replace(/\./g, "-")}`;

    const payload = {
      raspberry_id: raspberryId,
      message,
      latitude: isNaN(latitude) ? null : latitude,
      longitude: isNaN(longitude) ? null : longitude,
      host,
      url: typeof urlFromBody === "string" ? urlFromBody.trim() : null,
      ip_address: ip,
      message_date: nowIso,
      timestamp: nowIso,
    };

    // ------------------- Supabase -------------------
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return res.status(500).json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { error } = await supabase.from(TABLE_NAME).insert([payload]);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    return res.status(200).json({ ok: true, received: payload });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ ok: false, error: message });
  }
}
