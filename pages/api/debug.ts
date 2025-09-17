import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE ? "SET" : "MISSING",
    INGEST_SECRET: process.env.INGEST_SECRET ? "SET" : "MISSING",
    MOTIONS_TABLE: process.env.MOTIONS_TABLE || "not set",
  });
}
