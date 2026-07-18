"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginSchema } from "@/lib/schemas/auth";

export type LoginState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
};

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        email: flat.email?.[0],
        password: flat.password?.[0],
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Supabase returns the same generic message for "no such user" and
    // "wrong password" by design — don't narrow it further here, that
    // would leak which emails have accounts.
    return { error: "Incorrect email or password." };
  }

  revalidatePath("/", "layout");
  // Only ever follow a genuine same-origin relative path — "/m" or
  // "/dashboard", never anything starting with "//" or containing "://",
  // which would be an open-redirect vector if blindly trusted from a
  // query param. Falls back to /dashboard for anything that doesn't look
  // like a safe internal path, same as the previous hardcoded behavior.
  const next = formData.get("next");
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(target);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
