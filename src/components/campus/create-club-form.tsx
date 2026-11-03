"use client";

import { useActionState } from "react";
import { createClub } from "@/app/campus/actions";
import { Field, FormMessage, SubmitButton } from "@/components/account/form-parts";
import { idleForm } from "@/lib/account/types";

export function CreateClubForm({ universities }: { universities: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createClub, idleForm);
  const values = state.values ?? { name: "", thesis: "", university: "" };
  return (
    <form action={action} className="space-y-5" noValidate key={JSON.stringify(values)}>
      <Field id="name" label="Club name" required minLength={3} maxLength={80} defaultValue={values.name} placeholder="Wolverine Value Fund" />
      <div>
        <label htmlFor="thesis" className="block text-sm text-forest">What the club invests in (optional)</label>
        <textarea id="thesis" name="thesis" rows={3} maxLength={400} className="v-field mt-1.5" defaultValue={values.thesis} />
      </div>
      <div>
        <label htmlFor="university" className="block text-sm text-forest">University (optional)</label>
        <select id="university" name="university" className="v-field mt-1.5" defaultValue={values.university}>
          <option value="">No university</option>
          {universities.map((university) => (
            <option key={university.id} value={university.id}>{university.name}</option>
          ))}
        </select>
      </div>
      <p className="text-[13px] leading-5 text-quiet">You become the founder. The club is not official until a VestEd reviewer approves it.</p>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Creating…">Create club</SubmitButton>
    </form>
  );
}
