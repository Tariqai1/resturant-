import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const requiredEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];

  const missingEnv = requiredEnv.filter((name) => !process.env[name]);
  if (missingEnv.length > 0) {
    return NextResponse.json(
      { ok: false, database: "not_configured", missingEnv },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("restaurants").select("id").limit(1);

  const schemaMissing = error?.code === "42P01" || error?.code === "PGRST205";

  return NextResponse.json(
    {
      ok: !schemaMissing,
      database: "reachable",
      schema: schemaMissing ? "missing" : "configured_or_rls_protected",
    },
    { status: schemaMissing ? 503 : 200 },
  );
}
