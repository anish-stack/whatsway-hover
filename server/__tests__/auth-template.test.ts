import { describe, it, expect } from "vitest";
import { ensureOtpButton, isAuthTemplate } from "../utils/auth-template";

const otpTpl = { category: "AUTHENTICATION", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy Code" }] };
const body = [{ type: "body", parameters: [{ type: "text", text: "123456" }] }];

describe("authentication (OTP) templates — fixes Meta #131008", () => {
  it("adds the OTP url button with the body code", () => {
    expect(ensureOtpButton(body, otpTpl)).toEqual([
      ...body,
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
    ]);
  });
  it("detects by OTP button even if category is lowercase/missing", () => {
    expect(isAuthTemplate({ category: "authentication" })).toBe(true);
    expect(isAuthTemplate({ buttons: JSON.stringify([{ type: "OTP" }]) })).toBe(true);
    expect(isAuthTemplate({ category: "MARKETING", buttons: [{ type: "URL" }] })).toBe(false);
  });
  it("does not duplicate an existing button and replaces coupon copy_code", () => {
    const withUrl = [...body, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] }];
    expect(ensureOtpButton(withUrl, otpTpl)).toHaveLength(2);
    const coupon = [...body, { type: "button", sub_type: "copy_code", index: "0", parameters: [{ type: "coupon_code", coupon_code: "123456" }] }];
    expect(ensureOtpButton(coupon, otpTpl)[1]).toMatchObject({ sub_type: "url" });
  });
  it("leaves non-auth templates untouched and validates code", () => {
    expect(ensureOtpButton(body, { category: "UTILITY" })).toBe(body);
    expect(() => ensureOtpButton([], otpTpl)).toThrow(/OTP code/);
    expect(() => ensureOtpButton([{ type: "body", parameters: [{ type: "text", text: "1234567890123456" }] }], otpTpl)).toThrow(/15/);
  });
});
