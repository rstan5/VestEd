import { z } from "zod";

const CONTROL = /[\u0000-\u001f\u007f]/;

const displayName = z
  .string({ error: "Enter a display name." })
  .trim()
  .min(1, "Enter a display name.")
  .max(60, "Use 60 characters or fewer for your name.")
  .refine((value) => !CONTROL.test(value), "Remove unusual characters from your name.");

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."));

const newPassword = z
  .string({ error: "Enter a password." })
  .min(8, "Use at least 8 characters for your password.")
  .max(72, "Use 72 characters or fewer for your password.");

const blankToNull = (value: unknown) => (value === null || value === undefined || (typeof value === "string" && value.trim() === "") ? null : value);

const classYear = z.preprocess(
  (value) => {
    const cleaned = blankToNull(value);
    return typeof cleaned === "string" ? Number(cleaned.trim()) : cleaned;
  },
  z
    .number({ error: "Enter a four-digit class year." })
    .int("Enter a four-digit class year.")
    .min(2000, "Enter a class year from 2000 to 2040.")
    .max(2040, "Enter a class year from 2000 to 2040.")
    .nullable(),
);

const concentration = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .max(80, "Use 80 characters or fewer for your concentration.")
    .refine((value) => !CONTROL.test(value), "Remove unusual characters from your concentration.")
    .nullable(),
);

export const signUpSchema = z.object({ displayName, email, password: newPassword });

export const signInSchema = z.object({
  email,
  password: z.string({ error: "Enter your password." }).min(1, "Enter your password.").max(72, "Email or password is incorrect."),
});

export const profileSchema = z.object({ displayName, classYear, concentration });

export const onboardingSchema = profileSchema.extend({
  next: z.enum(["individual", "verify"], { error: "Choose how you want to continue." }),
});

export const privacySchema = z
  .object({
    holdings: z.enum(["private", "public"], { error: "Choose private or published." }),
    consent: z.preprocess((value) => value === "yes", z.boolean()),
  })
  .refine((value) => value.holdings === "private" || value.consent, {
    message: "Confirm that other students may see your tickers and weights before publishing.",
    path: ["consent"],
  });

export const passwordSchema = z
  .object({ password: newPassword, confirm: z.string({ error: "Repeat the new password." }) })
  .refine((value) => value.password === value.confirm, { message: "The two passwords do not match.", path: ["confirm"] });

export function readForm(form: FormData, names: readonly string[]): Record<string, FormDataEntryValue | null> {
  return Object.fromEntries(names.map((name) => [name, form.get(name)]));
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
