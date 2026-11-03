"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/account/types";
import { firstIssue, readForm } from "@/lib/account/validation";
import { campusErrorMessage } from "@/lib/campus/errors";
import {
  clubTargetSchema,
  createClubSchema,
  decisionSchema,
  disputeSchema,
  memberTargetSchema,
  roleSchema,
  universityEmailSchema,
} from "@/lib/campus/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SIGNED_OUT: FormState = { status: "error", message: "Your session ended. Sign in again to continue." };

// The acting student is always the verified session user. Form fields only name the club
// or the target student, and the database decides whether this student may act on them.
async function sessionClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function done(message: string): FormState {
  revalidatePath("/", "layout");
  return { status: "success", message };
}

export async function submitUniversityEmail(_previous: FormState, form: FormData): Promise<FormState> {
  const raw = readForm(form, ["email"]);
  const values = { email: text(raw.email) };
  const parsed = universityEmailSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), values };

  const supabase = await sessionClient();
  if (!supabase) return { ...SIGNED_OUT, values };

  const { data, error } = await supabase.rpc("request_university_affiliation", { p_email: parsed.data.email }).maybeSingle();
  if (error || !data) return { status: "error", message: campusErrorMessage(error, "Your university email was not submitted. Try again."), values };

  revalidatePath("/", "layout");
  return {
    status: "success",
    message:
      data.status === "verified"
        ? "This address is already verified. Nothing changed."
        : "Received. Your affiliation is pending review. A matching email domain does not verify you by itself.",
    values: { email: parsed.data.email },
  };
}

export async function createClub(_previous: FormState, form: FormData): Promise<FormState> {
  const raw = readForm(form, ["name", "thesis", "university"]);
  const values = { name: text(raw.name), thesis: text(raw.thesis), university: text(raw.university) };
  const parsed = createClubSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), values };

  const supabase = await sessionClient();
  if (!supabase) return { ...SIGNED_OUT, values };

  const { data, error } = await supabase.rpc("create_club", {
    p_name: parsed.data.name,
    p_thesis: parsed.data.thesis,
    p_university: parsed.data.university,
  });
  if (error || !data) return { status: "error", message: campusErrorMessage(error, "The club was not created. Try again."), values };

  revalidatePath("/", "layout");
  redirect(`/campus/clubs/${data}`);
}

export async function applyToClub(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = clubTargetSchema.safeParse(readForm(form, ["clubId"]));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };
  const supabase = await sessionClient();
  if (!supabase) return SIGNED_OUT;
  const { error } = await supabase.rpc("apply_to_club", { p_club: parsed.data.clubId });
  if (error) return { status: "error", message: campusErrorMessage(error, "Your application was not sent. Try again.") };
  return done("Application sent. A club leader will approve or decline it.");
}

export async function withdrawApplication(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = clubTargetSchema.safeParse(readForm(form, ["clubId"]));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };
  const supabase = await sessionClient();
  if (!supabase) return SIGNED_OUT;
  const { error } = await supabase.rpc("withdraw_club_application", { p_club: parsed.data.clubId });
  if (error) return { status: "error", message: campusErrorMessage(error, "Your application was not withdrawn. Try again.") };
  return done("Application withdrawn.");
}

export async function decideApplication(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = decisionSchema.safeParse(readForm(form, ["clubId", "studentId", "decision"]));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };
  const supabase = await sessionClient();
  if (!supabase) return SIGNED_OUT;
  const { error } = await supabase.rpc("decide_club_application", {
    p_club: parsed.data.clubId,
    p_student: parsed.data.studentId,
    p_decision: parsed.data.decision,
  });
  if (error) return { status: "error", message: campusErrorMessage(error, "The decision was not saved. Try again.") };
  return done(parsed.data.decision === "approve" ? "Approved. The student is now a member." : "Declined. The student can see the decision.");
}

export async function setMemberRole(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = roleSchema.safeParse(readForm(form, ["clubId", "studentId", "role"]));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };
  const supabase = await sessionClient();
  if (!supabase) return SIGNED_OUT;
  const { error } = await supabase.rpc("set_club_member_role", {
    p_club: parsed.data.clubId,
    p_student: parsed.data.studentId,
    p_role: parsed.data.role,
  });
  if (error) return { status: "error", message: campusErrorMessage(error, "The role was not changed. Try again.") };
  return done(parsed.data.role === "moderator" ? "Now a moderator." : "Now a member.");
}

export async function removeMember(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = memberTargetSchema.safeParse(readForm(form, ["clubId", "studentId"]));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };
  const supabase = await sessionClient();
  if (!supabase) return SIGNED_OUT;
  const { error } = await supabase.rpc("remove_club_member", { p_club: parsed.data.clubId, p_student: parsed.data.studentId });
  if (error) return { status: "error", message: campusErrorMessage(error, "The member was not removed. Try again.") };
  return done("Removed from the club.");
}

export async function leaveClub(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = clubTargetSchema.safeParse(readForm(form, ["clubId"]));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };
  const supabase = await sessionClient();
  if (!supabase) return SIGNED_OUT;
  const { error } = await supabase.rpc("leave_club", { p_club: parsed.data.clubId });
  if (error) return { status: "error", message: campusErrorMessage(error, "You are still in the club. Try again.") };
  return done("You left the club. You still compete as an individual.");
}

export async function fileDispute(_previous: FormState, form: FormData): Promise<FormState> {
  const raw = readForm(form, ["clubId", "reason"]);
  const values = { reason: text(raw.reason) };
  const parsed = disputeSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), values };
  const supabase = await sessionClient();
  if (!supabase) return { ...SIGNED_OUT, values };
  const { error } = await supabase.rpc("file_club_dispute", { p_club: parsed.data.clubId, p_reason: parsed.data.reason });
  if (error) return { status: "error", message: campusErrorMessage(error, "The dispute was not filed. Try again."), values };
  return done("Dispute filed. It waits for an admin reviewer. Club members and moderators cannot resolve it.");
}
