import { redirect } from "next/navigation";

export default function CreateProjectRedirectPage() {
  redirect("/app/projects?createProject=1");
}
