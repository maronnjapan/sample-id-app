import { signIn } from "@/auth";

export function LoginForm() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("okta");
      }}
    >
      <button
        type="submit"
        className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-6 rounded-md text-lg"
      >
        Oktaでログイン
      </button>
    </form>
  );
}
