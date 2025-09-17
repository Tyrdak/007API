import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INGEST_SECRET = process.env.INGEST_SECRET;
const TABLE_NAME = process.env.MOTIONS_TABLE || "motions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = req.body || {};

    const providedKey = body.Key || body.key || "";
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
      // In development without an ingest secret, accept all requests.
    }

    const message = body.Msg || "Vodka-Martini";
    const host = body.Host || "unknown";

    let latitude = parseFloat(body.lat || body.latitude);
    let longitude = parseFloat(body.lon || body.longitude);
    if ((isNaN(latitude) || isNaN(longitude)) && typeof body.loc === "string") {
      const m = body.loc.trim().match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
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
      ip_address: ip,
      message_date: nowIso,
      timestamp: nowIso,
    };

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
