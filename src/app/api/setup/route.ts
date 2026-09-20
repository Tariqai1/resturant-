import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SetupRequest = {
  restaurantName?: string;
  ownerName?: string;
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl || /your|replace|example|xxxx|secret-key/i.test(serviceRoleKey)) {
    return NextResponse.json({ message: "Add the real Supabase secret/service-role key to .env.local, then restart the dev server" }, { status: 503 });
  }

  let body: SetupRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid setup request" }, { status: 400 });
  }

  const restaurantName = body.restaurantName?.trim();
  const ownerName = body.ownerName?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!restaurantName || !ownerName || !email || !password) {
    return NextResponse.json({ message: "All fields are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ message: "Password must be at least 8 characters" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { count, error: staffCountError } = await admin
    .from("staff_users")
    .select("id", { count: "exact", head: true });

  if (staffCountError) {
    console.error("First-admin setup status check failed", staffCountError);
    return NextResponse.json({ message: "Unable to check setup status. Confirm migrations are applied and the Supabase secret key is valid." }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json({ message: "Initial setup has already been completed" }, { status: 409 });
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ message: authError?.message ?? "Unable to create owner account" }, { status: 400 });
  }

  const { data: restaurant, error: restaurantError } = await admin
    .from("restaurants")
    .insert({ name: restaurantName, owner_email: email })
    .select("id")
    .single();

  if (restaurantError || !restaurant) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ message: "Unable to create restaurant" }, { status: 500 });
  }

  const pinHash = await bcrypt.hash(crypto.randomUUID(), 10);
  const { error: staffError } = await admin.from("staff_users").insert({
    restaurant_id: restaurant.id,
    auth_user_id: authData.user.id,
    name: ownerName,
    role: "owner",
    pin_hash: pinHash,
  });

  if (staffError) {
    await admin.from("restaurants").delete().eq("id", restaurant.id);
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ message: "Unable to finish owner setup" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Owner account created" }, { status: 201 });
}