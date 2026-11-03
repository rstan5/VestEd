const MESSAGES: Record<string, string> = {
  not_signed_in: "Your session ended. Sign in again.",
  invalid_email: "Enter a valid university email address.",
  unknown_university_domain: "That email domain is not a recognized university yet. Use your university-issued address.",
  email_already_claimed: "Another student has already submitted that university email.",
  admin_only: "Only a VestEd reviewer can make that decision.",
  invalid_club_name: "Use 3 to 80 characters for the club name.",
  invalid_club_thesis: "Use 400 characters or fewer for the club description.",
  unknown_university: "Choose a university from the list, or leave it blank.",
  already_in_club: "You are already in a club. A student belongs to one club at a time.",
  club_name_taken: "A club with that name already exists.",
  club_not_found: "That club no longer exists.",
  club_closed: "This club is not accepting applications.",
  application_already_rejected: "This club already declined your application.",
  no_pending_application: "There is no pending application to act on. Reload the page.",
  not_club_leader: "Only the club founder or a moderator can do that.",
  applicant_in_other_club: "That student has already joined another club.",
  cannot_change_own_role: "You cannot change your own club role.",
  founder_only: "Only the club founder can do that.",
  invalid_role: "Choose moderator or member.",
  not_a_member: "That student is not an active member.",
  cannot_remove_founder: "The founder cannot be removed.",
  use_leave_club: "Use Leave club to remove yourself.",
  founder_must_transfer: "A founder cannot leave the club.",
  club_under_review: "This club is in admin review. Leadership and official status cannot change until a reviewer resolves it.",
  already_founder: "You already lead this club.",
  invalid_dispute_reason: "Describe the dispute in 10 to 1000 characters.",
  dispute_already_open: "A dispute about this club is already waiting for admin review.",
  invalid_decision: "That decision is not allowed.",
};

export function campusErrorCode(error: { message?: string } | null | undefined): string | null {
  const code = error?.message?.trim();
  return code && code in MESSAGES ? code : null;
}

export function campusErrorMessage(error: { message?: string } | null | undefined, fallback: string): string {
  const code = campusErrorCode(error);
  return code ? MESSAGES[code] : fallback;
}
