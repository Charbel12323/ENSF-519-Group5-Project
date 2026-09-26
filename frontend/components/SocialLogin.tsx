"use client";
import { useEffect, useState } from "react";
import { api, API_URL } from "@/lib/api";
export default function SocialLogin() {
  const [google, setGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ google: boolean }>("/api/auth/providers").then((data) => { setGoogle(data.google); setError(new URLSearchParams(window.location.search).get("error")); }).catch(() => {});
  }, []);
  return <>{error && <p className="error mt-4" role="alert">{error}</p>}{google && <a className="btn mt-4 block text-center" href={`${API_URL}/api/auth/google`}>Continue with Google</a>}</>;
}
