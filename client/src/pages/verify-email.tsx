/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 *
  
 *
  
 * ============================================================
 */

import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const VerifyEmail = () => {
  const [location, setLocation] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const email = searchParams.get("email") || "";

  const [otp, setOtp] = useState(Array(6).fill(""));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  // resend: 60s cooldown (starts right away when we arrive from "Resend verification email")
  const [cooldown, setCooldown] = useState(() => (searchParams.get("sent") ? 60 : 0));
  const [resending, setResending] = useState(false);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const resend = async () => {
    if (!email || cooldown > 0) return;
    setResending(true); setError(""); setSuccess("");
    try {
      const r = await apiRequest("POST", "/api/auth/resend-verification", { email });
      const j = await r.json();
      setSuccess(j.kind === "invite" ? j.message : "A new code is on its way. Check your inbox (and spam).");
      setOtp(Array(6).fill(""));
      setCooldown(60);
    } catch (e: any) {
      setError(e?.message || "Couldn't resend the code. Try again.");
    } finally { setResending(false); }
  };

  const handleOtpChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    const value = e.target.value.replace(/\D/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto focus next
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = otp.join("");
    if (otpCode.length < 6) {
      setError("Please enter the 6-digit OTP.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await apiRequest("POST", "/api/users/verifyEmail", {
        email,
        otpCode,
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Invalid OTP");
        setLoading(false);
        return;
      }

      // The server has already signed the user in. Reload into the app so the
      // cached "not logged in" auth state is replaced by the new session.
      setSuccess("Email verified! Taking you to your dashboard…");
      try { sessionStorage.setItem("fromLogin", "true"); } catch { /* ignore */ }
      setTimeout(() => { window.location.href = "/dashboard"; }, 800);
    } catch (err) {
      setError("Verification failed, try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div className="bg-background shadow-md rounded-xl p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-4">
          Verify Your Email
        </h2>
        <p className="text-muted-foreground text-center mb-6">
          A 6-digit code was sent to: <br />
          <span className="font-semibold">{email}</span>
        </p>

        <div className="flex justify-between mb-4">
          {otp.map((digit, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              type="text"
              maxLength={1}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1}`}
              value={digit}
              onChange={(e) => handleOtpChange(e, i)}
              onPaste={(e) => {
                const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                if (digits.length < 2) return;
                e.preventDefault();
                setOtp(Array(6).fill("").map((_, k) => digits[k] || ""));
                document.getElementById(`otp-${digits.length - 1}`)?.focus();
              }}
              className="w-12 h-12 border rounded-lg text-center text-xl focus:ring-2 focus:ring-green-500"
            />
          ))}
        </div>

        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-2">{success}</p>}

        <button
          onClick={handleVerify}
          disabled={loading}
          className="w-full bg-green-600 text-white p-3 rounded-lg"
        >
          {loading ? "Verifying..." : "Verify Email"}
        </button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Didn't get the code?{" "}
          <button
            type="button"
            onClick={resend}
            disabled={resending || cooldown > 0 || !email}
            className="font-medium text-green-700 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {resending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default VerifyEmail;
