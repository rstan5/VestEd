import { z } from "zod";

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const id = z.uuid("That request is not valid. Reload the page.");

export const universityEmailSchema = z.object({
  email: z
    .string({ error: "Enter your university email address." })
    .trim()
    .toLowerCase()
    .min(1, "Enter your university email address.")
    .max(254, "That email address is too long.")
    .pipe(z.email("Enter a valid university email address.")),
});

export const createClubSchema = z.object({
  name: z
    .string({ error: "Enter a club name." })
    .trim()
    .min(3, "Use 3 to 80 characters for the club name.")
    .max(80, "Use 3 to 80 characters for the club name.")
    .refine((value) => !CONTROL.test(value), "Remove unusual characters from the name."),
  thesis: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value : null),
    z.string().trim().max(400, "Use 400 characters or fewer for the description.").nullable(),
  ),
  university: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null),
    z.string().regex(/^[a-z0-9-]{2,40}$/, "Choose a university from the list.").nullable(),
  ),
});

export const clubTargetSchema = z.object({ clubId: id });
export const memberTargetSchema = z.object({ clubId: id, studentId: id });
export const decisionSchema = memberTargetSchema.extend({ decision: z.enum(["approve", "reject"], { error: "Choose approve or reject." }) });
export const roleSchema = memberTargetSchema.extend({ role: z.enum(["moderator", "member"], { error: "Choose moderator or member." }) });
export const disputeSchema = clubTargetSchema.extend({
  reason: z
    .string({ error: "Describe the dispute." })
    .trim()
    .min(10, "Describe the dispute in 10 to 1000 characters.")
    .max(1000, "Describe the dispute in 10 to 1000 characters."),
});
